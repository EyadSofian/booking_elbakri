import { normalizeAliasKey, normalizeForSearch } from '@elbakri/shared';
import {
  HOTEL_SOURCE_SYSTEM,
  HotelDirectorySyncService,
  HotelSyncStatus,
} from './hotel-directory-sync.service';
import { HotelDirectoryUnavailableError, type DirectoryHotel } from './hotel-directory.client';

/**
 * Sync behaviour, against an in-memory stand-in for the database.
 *
 * These assert the rules that make the sync safe to run repeatedly: it must be
 * idempotent, it must never merge on a resemblance, an upstream rename must not
 * duplicate, and a hotel going inactive must keep its history.
 */

interface FakeHotel {
  id: string;
  name: string;
  normalizedName: string;
  sourceSystem: string | null;
  externalId: string | null;
  syncStatus: string;
  isActive: boolean;
  deletedAt: Date | null;
  [key: string]: unknown;
}

function makeFakePrisma() {
  const hotels: FakeHotel[] = [];
  const aliases: Array<{ id: string; hotelId: string; alias: string; aliasKey: string }> = [];
  const locations: Array<{ id: string; name: string; normalizedName: string; hotelId: string | null }> = [];
  const aliasMappings: Array<Record<string, unknown>> = [];
  let seq = 0;

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'NOT') {
        return !matches(row, value as Record<string, unknown>);
      }
      if (value && typeof value === 'object' && 'startsWith' in (value as object)) {
        return String(row[key] ?? '').startsWith((value as { startsWith: string }).startsWith);
      }
      return row[key] === value;
    });

  return {
    hotels,
    aliases,
    locations,
    aliasMappings,
    hotel: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        hotels.find((h) => matches(h, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        hotels.find((h) => h.id === where.id) ?? null,
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        hotels.filter((h) => matches(h, where)).slice(0, take ?? 100),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `h${++seq}`, deletedAt: null, ...data } as FakeHotel;
        hotels.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = hotels.find((h) => h.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    hotelAlias: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = aliases.find((a) => matches(a, where));
        if (!found) return null;
        return { ...found, hotel: hotels.find((h) => h.id === found.hotelId) ?? null };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `a${++seq}`, ...data } as (typeof aliases)[number];
        aliases.push(row);
        return row;
      },
    },
    location: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        locations.find((l) => matches(l, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `l${++seq}`, ...data } as (typeof locations)[number];
        locations.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = locations.find((l) => l.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    aliasMapping: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        aliasMappings.push(create);
        return create;
      },
    },
    systemSetting: {
      upsert: async () => ({}),
      findUnique: async () => null,
    },
  };
}

function upstream(over: Partial<DirectoryHotel> & { id: number; hotel_name: string }): DirectoryHotel {
  return {
    hotel_group_id: null, group_name: null, region: null, sub_region: null,
    star_rating: null, address: null, description: null, facilities: null,
    child_policy_default: null, transfer_notes_default: null,
    status: 'Active', updated_at: '2026-09-07 10:00:00',
    ...over,
  };
}

function makeService(hotelsToReturn: DirectoryHotel[]) {
  const prisma = makeFakePrisma();
  const client = {
    configured: true,
    fetchHotels: jest.fn().mockResolvedValue({
      hotels: hotelsToReturn,
      droppedFields: [],
      fetchedAt: new Date(),
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new HotelDirectorySyncService(
    prisma as never,
    client as never,
    audit as never,
  );
  return { service, prisma, client, audit };
}

const CTX = { actorId: 'u1', actorLabel: 'Tester', requestId: 'r1' } as never;

describe('HotelDirectorySyncService', () => {
  it('creates a hotel the catalogue has never seen', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hotel' })]);
    const result = await service.sync(CTX);

    expect(result.created).toBe(1);
    expect(prisma.hotels).toHaveLength(1);
    expect(prisma.hotels[0].sourceSystem).toBe(HOTEL_SOURCE_SYSTEM);
    expect(prisma.hotels[0].externalId).toBe('1');
    expect(prisma.hotels[0].syncStatus).toBe(HotelSyncStatus.LINKED);
  });

  it('is idempotent — a second run creates nothing', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hotel' })]);
    await service.sync(CTX);
    const second = await service.sync(CTX);

    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(prisma.hotels).toHaveLength(1);
  });

  it('links an existing Excel-imported hotel by exact name instead of duplicating', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hotel' })]);
    prisma.hotels.push({
      id: 'existing', name: 'Gravity Hotel',
      normalizedName: normalizeForSearch('Gravity Hotel'),
      sourceSystem: null, externalId: null,
      syncStatus: HotelSyncStatus.LOCAL_ONLY, isActive: true, deletedAt: null,
    });

    const result = await service.sync(CTX);

    expect(result.matched).toBe(1);
    expect(result.created).toBe(0);
    expect(prisma.hotels).toHaveLength(1);
    expect(prisma.hotels[0].id).toBe('existing');
    expect(prisma.hotels[0].externalId).toBe('1');
  });

  it('links through an approved alias', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'GRAVITY HOTEL SAHL' })]);
    prisma.hotels.push({
      id: 'existing', name: 'Gravity Sahl Hasheesh',
      normalizedName: normalizeForSearch('Gravity Sahl Hasheesh'),
      sourceSystem: null, externalId: null,
      syncStatus: HotelSyncStatus.LOCAL_ONLY, isActive: true, deletedAt: null,
    });
    prisma.aliases.push({
      id: 'al1', hotelId: 'existing',
      alias: 'GRAVITY HOTEL SAHL', aliasKey: normalizeAliasKey('GRAVITY HOTEL SAHL'),
    });

    const result = await service.sync(CTX);

    expect(result.matched).toBe(1);
    expect(prisma.hotels).toHaveLength(1);
    expect(prisma.hotels[0].externalId).toBe('1');
  });

  it('an upstream rename updates in place and keeps the old spelling as an alias', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hotel' })]);
    await service.sync(CTX);

    // Same external id, different name.
    const { service: renamed } = (() => {
      const client = {
        configured: true,
        fetchHotels: jest.fn().mockResolvedValue({
          hotels: [upstream({ id: 1, hotel_name: 'Gravity Resort & Spa' })],
          droppedFields: [], fetchedAt: new Date(),
        }),
      };
      return {
        service: new HotelDirectorySyncService(
          prisma as never, client as never, { record: jest.fn() } as never,
        ),
      };
    })();

    await renamed.sync(CTX);

    expect(prisma.hotels).toHaveLength(1);
    expect(prisma.hotels[0].name).toBe('Gravity Resort & Spa');
    expect(prisma.aliases.map((a) => a.alias)).toContain('Gravity Hotel');
  });

  it('never merges on a resemblance — an ambiguous name becomes a review item', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hurghada' })]);
    // Two plausible local candidates: the sync must not choose.
    prisma.hotels.push(
      {
        id: 'a', name: 'Gravity Hotel Aqua', normalizedName: 'gravity hotel aqua',
        sourceSystem: null, externalId: null, syncStatus: 'LOCAL_ONLY',
        isActive: true, deletedAt: null,
      },
      {
        id: 'b', name: 'Gravity Hotel Sahl', normalizedName: 'gravity hotel sahl',
        sourceSystem: null, externalId: null, syncStatus: 'LOCAL_ONLY',
        isActive: true, deletedAt: null,
      },
    );

    const result = await service.sync(CTX);

    // Neither existing hotel was bound; a new one was created rather than a
    // guess being applied to either.
    expect(prisma.hotels.find((h) => h.id === 'a')!.externalId).toBeNull();
    expect(prisma.hotels.find((h) => h.id === 'b')!.externalId).toBeNull();
    expect(result.matched).toBe(0);
  });

  it('queues a single close match for review instead of linking it', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hurghada' })]);
    prisma.hotels.push({
      id: 'a', name: 'Gravity Hotel Aqua', normalizedName: 'gravity hotel aqua',
      sourceSystem: null, externalId: null, syncStatus: 'LOCAL_ONLY',
      isActive: true, deletedAt: null,
    });

    const result = await service.sync(CTX);

    expect(result.needsReview).toBe(1);
    expect(result.created).toBe(0);
    expect(prisma.aliasMappings).toHaveLength(1);
    expect(prisma.aliasMappings[0].rawValue).toBe('Gravity Hurghada');
    // Crucially: not linked.
    expect(prisma.hotels.find((h) => h.id === 'a')!.externalId).toBeNull();
  });

  it('deactivates an upstream-inactive hotel without deleting it', async () => {
    const { service, prisma } = makeService([
      upstream({ id: 1, hotel_name: 'Closed Resort', status: 'Inactive' }),
    ]);
    await service.sync(CTX);

    expect(prisma.hotels).toHaveLength(1);
    expect(prisma.hotels[0].isActive).toBe(false);
    expect(prisma.hotels[0].deletedAt).toBeNull();
  });

  it('links a transfer location once, not on every sync', async () => {
    const { service, prisma } = makeService([upstream({ id: 1, hotel_name: 'Gravity Hotel' })]);
    await service.sync(CTX);
    await service.sync(CTX);

    expect(prisma.locations).toHaveLength(1);
    expect(prisma.locations[0].hotelId).toBe(prisma.hotels[0].id);
  });

  it('records a per-hotel failure and carries on with the rest', async () => {
    const { service, prisma } = makeService([
      upstream({ id: 1, hotel_name: 'Good One' }),
      upstream({ id: 2, hotel_name: 'Bad One' }),
      upstream({ id: 3, hotel_name: 'Another Good' }),
    ]);
    const realCreate = prisma.hotel.create;
    prisma.hotel.create = (async (args: { data: Record<string, unknown> }) => {
      if (args.data.name === 'Bad One') throw new Error('database exploded');
      return realCreate(args);
    }) as typeof prisma.hotel.create;

    const result = await service.sync(CTX);

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Bad One');
  });

  it('refuses to start a second run while one is in flight', async () => {
    const { service, client } = makeService([upstream({ id: 1, hotel_name: 'Slow Hotel' })]);
    let release: () => void = () => {};
    client.fetchHotels.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ hotels: [], droppedFields: [], fetchedAt: new Date() });
      }),
    );

    const first = service.sync(CTX);
    await expect(service.sync(CTX)).rejects.toBeInstanceOf(HotelDirectoryUnavailableError);

    release();
    await first;
    // The guard must clear, or a single failure locks sync out forever.
    expect(service.isRunning).toBe(false);
  });

  it('mirrors descriptive metadata and nothing financial', async () => {
    const { service, prisma } = makeService([
      upstream({
        id: 1, hotel_name: 'Gravity Hotel',
        group_name: 'Gravity', region: 'Hurghada', sub_region: 'Sahl Hasheesh',
        star_rating: 5, description: 'Beachfront.', facilities: 'Pool',
        child_policy_default: 'Under 6 free.', transfer_notes_default: '25 min.',
      }),
    ]);
    await service.sync(CTX);

    const hotel = prisma.hotels[0];
    expect(hotel.hotelGroupName).toBe('Gravity');
    expect(hotel.region).toBe('Hurghada');
    expect(hotel.facilities).toBe('Pool');

    const keys = Object.keys(hotel).map((k) => k.toLowerCase());
    for (const forbidden of ['price', 'rate', 'currency', 'package', 'commission', 'cost']) {
      expect(keys.some((k) => k.includes(forbidden))).toBe(false);
    }
  });
});
