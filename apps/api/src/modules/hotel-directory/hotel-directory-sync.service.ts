import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeAliasKey, normalizeForSearch } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/services/request-context.service';
import {
  HotelDirectoryClient,
  HotelDirectoryUnavailableError,
  type DirectoryHotel,
} from './hotel-directory.client';

export const HOTEL_SOURCE_SYSTEM = 'elbakri-rate';

/** How a local hotel relates to the upstream directory. */
export const HotelSyncStatus = {
  /** Bound to an upstream record by external id. */
  LINKED: 'LINKED',
  /** A likely upstream match exists but a person must confirm it. */
  NEEDS_MATCH: 'NEEDS_MATCH',
  /** Maintained here only; the directory has no such hotel. */
  LOCAL_ONLY: 'LOCAL_ONLY',
} as const;

/**
 * The descriptive fields mirrored from the directory.
 *
 * Deliberately plain values rather than Prisma's update-input type, so the same
 * object can be spread into both a create and an update — and so it is obvious
 * at a glance that nothing financial is in it.
 */
interface DirectoryMetadata {
  hotelGroupName: string | null;
  region: string | null;
  subRegion: string | null;
  starRating: number | null;
  address: string | null;
  description: string | null;
  facilities: string | null;
  childPolicyDefault: string | null;
  transferNotesDefault: string | null;
  externalStatus: string | null;
  externalUpdatedAt: Date | null;
  lastSyncedAt: Date;
}

export interface SyncResult {
  startedAt: Date;
  finishedAt: Date;
  received: number;
  created: number;
  updated: number;
  matched: number;
  needsReview: number;
  deactivated: number;
  locationsLinked: number;
  droppedFields: string[];
  errors: string[];
}

@Injectable()
export class HotelDirectorySyncService {
  private readonly logger = new Logger(HotelDirectorySyncService.name);
  /** Guards against two syncs running at once. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: HotelDirectoryClient,
    private readonly audit: AuditService,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  get isConfigured(): boolean {
    return this.client.configured;
  }

  /**
   * Pulls the directory and reconciles it with the local catalogue.
   *
   * Idempotent: running it twice changes nothing the second time. Matching is
   * deterministic — external id, then exact canonical name, then an approved
   * alias. A merely similar name is never merged automatically; it becomes a
   * review item, because a wrong merge silently moves one hotel's bookings
   * onto another and is far harder to notice than a duplicate.
   */
  async sync(ctx: ActorContext, opts: { since?: Date | null } = {}): Promise<SyncResult> {
    if (this.running) {
      throw new HotelDirectoryUnavailableError('A hotel synchronisation is already running.');
    }
    this.running = true;
    const startedAt = new Date();

    const result: SyncResult = {
      startedAt,
      finishedAt: startedAt,
      received: 0,
      created: 0,
      updated: 0,
      matched: 0,
      needsReview: 0,
      deactivated: 0,
      locationsLinked: 0,
      droppedFields: [],
      errors: [],
    };

    try {
      const fetched = await this.client.fetchHotels(opts.since ?? null);
      result.received = fetched.hotels.length;
      result.droppedFields = fetched.droppedFields;

      for (const upstream of fetched.hotels) {
        try {
          await this.reconcileOne(upstream, result);
        } catch (err) {
          const message = `${upstream.hotel_name} (#${upstream.id}): ${(err as Error).message}`;
          result.errors.push(message);
          this.logger.error({ err, hotel: upstream.id }, 'Failed to reconcile a directory hotel');
        }
      }

      result.finishedAt = new Date();

      await this.recordRun(result, 'SUCCESS');
      await this.audit.record({
        action: 'HOTEL_DIRECTORY_SYNCED',
        entityType: 'Hotel',
        entityId: null,
        actorId: ctx.actorId,
        actorLabel: ctx.actorLabel,
        requestId: ctx.requestId,
        after: {
          received: result.received,
          created: result.created,
          updated: result.updated,
          matched: result.matched,
          needsReview: result.needsReview,
          deactivated: result.deactivated,
        },
      });

      return result;
    } catch (err) {
      result.finishedAt = new Date();
      result.errors.push((err as Error).message);
      await this.recordRun(result, 'FAILED');
      throw err;
    } finally {
      this.running = false;
    }
  }

  /** Reconciles one upstream hotel against the local catalogue. */
  private async reconcileOne(upstream: DirectoryHotel, result: SyncResult): Promise<void> {
    const externalId = String(upstream.id);
    const metadata = this.metadataFor(upstream);

    // 1. Already bound by external id — the only case that updates silently.
    const linked = await this.prisma.hotel.findFirst({
      where: { sourceSystem: HOTEL_SOURCE_SYSTEM, externalId },
    });

    if (linked) {
      // An upstream rename keeps the previous spelling as an alias, so historic
      // imports and typed searches still find the hotel.
      if (normalizeForSearch(linked.name) !== normalizeForSearch(upstream.hotel_name)) {
        await this.preserveNameAsAlias(linked.id, linked.name);
      }
      await this.prisma.hotel.update({
        where: { id: linked.id },
        data: {
          ...metadata,
          name: upstream.hotel_name,
          normalizedName: await this.uniqueNormalizedName(upstream.hotel_name, linked.id),
          syncStatus: HotelSyncStatus.LINKED,
        },
      });
      result.updated++;
      if (this.isInactiveUpstream(upstream)) result.deactivated++;
      result.locationsLinked += await this.linkLocation(linked.id, upstream.hotel_name);
      return;
    }

    // 2. Exact canonical name.
    const normalized = normalizeForSearch(upstream.hotel_name);
    const byName = await this.prisma.hotel.findFirst({
      where: { normalizedName: normalized, deletedAt: null },
    });

    if (byName) {
      await this.bind(byName.id, externalId, metadata);
      result.matched++;
      result.locationsLinked += await this.linkLocation(byName.id, upstream.hotel_name);
      return;
    }

    // 3. An alias someone already approved.
    const alias = await this.prisma.hotelAlias.findFirst({
      where: { aliasKey: normalizeAliasKey(upstream.hotel_name) },
      include: { hotel: true },
    });

    if (alias?.hotel && !alias.hotel.deletedAt) {
      if (alias.hotel.sourceSystem && alias.hotel.externalId !== externalId) {
        // Already bound to a different upstream hotel — a person must decide.
        await this.queueForReview(upstream, result, alias.hotel.id);
        return;
      }
      await this.bind(alias.hotel.id, externalId, metadata);
      result.matched++;
      result.locationsLinked += await this.linkLocation(alias.hotel.id, upstream.hotel_name);
      return;
    }

    // 4. Nothing deterministic. Look for a near match to suggest, but never
    //    apply it: similarity is evidence for a person, not a decision.
    const candidate = await this.findReviewCandidate(upstream.hotel_name);
    if (candidate) {
      await this.queueForReview(upstream, result, candidate.id);
      return;
    }

    // 5. Genuinely new.
    const created = await this.prisma.hotel.create({
      data: {
        name: upstream.hotel_name,
        normalizedName: await this.uniqueNormalizedName(upstream.hotel_name),
        sourceSystem: HOTEL_SOURCE_SYSTEM,
        externalId,
        syncStatus: HotelSyncStatus.LINKED,
        isActive: !this.isInactiveUpstream(upstream),
        ...metadata,
      },
    });
    result.created++;
    result.locationsLinked += await this.linkLocation(created.id, upstream.hotel_name);
  }

  /** The descriptive fields mirrored from upstream. Never anything financial. */
  private metadataFor(upstream: DirectoryHotel): DirectoryMetadata {
    return {
      hotelGroupName: upstream.group_name,
      region: upstream.region,
      subRegion: upstream.sub_region,
      starRating: upstream.star_rating,
      address: upstream.address,
      description: upstream.description,
      facilities: upstream.facilities,
      childPolicyDefault: upstream.child_policy_default,
      transferNotesDefault: upstream.transfer_notes_default,
      externalStatus: upstream.status,
      externalUpdatedAt: upstream.updated_at ? new Date(upstream.updated_at) : null,
      lastSyncedAt: new Date(),
    };
  }

  private isInactiveUpstream(upstream: DirectoryHotel): boolean {
    return (upstream.status ?? '').toLowerCase() === 'inactive';
  }

  /**
   * Binds a local hotel to its upstream record.
   *
   * An upstream hotel going inactive stops it being offered for new bookings
   * but never deletes it: the stays already recorded against it must keep
   * their hotel.
   */
  private async bind(
    hotelId: string,
    externalId: string,
    metadata: DirectoryMetadata,
  ): Promise<void> {
    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: {
        ...metadata,
        sourceSystem: HOTEL_SOURCE_SYSTEM,
        externalId,
        syncStatus: HotelSyncStatus.LINKED,
        ...(metadata.externalStatus === 'Inactive' ? { isActive: false } : {}),
      },
    });
  }

  /** Records a suggestion for a person to confirm. Nothing is linked. */
  private async queueForReview(
    upstream: DirectoryHotel,
    result: SyncResult,
    suggestedId: string,
  ): Promise<void> {
    const suggested = await this.prisma.hotel.findUnique({ where: { id: suggestedId } });

    await this.prisma.aliasMapping.upsert({
      where: {
        entityType_aliasKey: {
          entityType: 'HOTEL',
          aliasKey: normalizeAliasKey(upstream.hotel_name),
        },
      },
      create: {
        entityType: 'HOTEL',
        rawValue: upstream.hotel_name,
        aliasKey: normalizeAliasKey(upstream.hotel_name),
        suggestedId,
        suggestedName: suggested?.name ?? null,
        score: 0.8,
        status: 'SUGGESTED',
      },
      update: {
        suggestedId,
        suggestedName: suggested?.name ?? null,
        occurrences: { increment: 1 },
      },
    });

    if (suggested && suggested.syncStatus !== HotelSyncStatus.LINKED) {
      await this.prisma.hotel.update({
        where: { id: suggested.id },
        data: { syncStatus: HotelSyncStatus.NEEDS_MATCH },
      });
    }
    result.needsReview++;
  }

  /** A single close-enough local hotel, or nothing. Ambiguity is not a match. */
  private async findReviewCandidate(name: string): Promise<{ id: string; name: string } | null> {
    const key = normalizeForSearch(name);
    const head = key.split(' ')[0];
    if (!head || head.length < 4) return null;

    const candidates = await this.prisma.hotel.findMany({
      where: {
        deletedAt: null,
        sourceSystem: null, // only hotels not already bound upstream
        normalizedName: { startsWith: head },
      },
      select: { id: true, name: true, normalizedName: true },
      take: 5,
    });

    // Exactly one plausible candidate, or leave it alone.
    return candidates.length === 1 ? { id: candidates[0].id, name: candidates[0].name } : null;
  }

  /** Keeps a superseded spelling reachable after an upstream rename. */
  private async preserveNameAsAlias(hotelId: string, previousName: string): Promise<void> {
    const aliasKey = normalizeAliasKey(previousName);
    if (!aliasKey) return;
    const existing = await this.prisma.hotelAlias.findFirst({ where: { aliasKey } });
    if (existing) return;
    await this.prisma.hotelAlias.create({
      data: { hotelId, alias: previousName, aliasKey, source: 'DIRECTORY_RENAME' },
    });
  }

  /**
   * `normalizedName` is unique, so a genuine name collision has to be resolved
   * rather than allowed to throw mid-sync.
   */
  private async uniqueNormalizedName(name: string, selfId?: string): Promise<string> {
    const base = normalizeForSearch(name);
    let candidate = base;
    let suffix = 2;
    for (;;) {
      const clash = await this.prisma.hotel.findFirst({
        where: { normalizedName: candidate, ...(selfId ? { NOT: { id: selfId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base} ${suffix++}`;
    }
  }

  /**
   * Makes a hotel usable as a transfer pickup point.
   *
   * Deterministic by hotel id, so repeated syncs do not create a second
   * location every time — and a hotel is one place, not two records that
   * happen to share a name.
   */
  private async linkLocation(hotelId: string, hotelName: string): Promise<number> {
    const existing = await this.prisma.location.findFirst({ where: { hotelId } });
    if (existing) return 0;

    const normalized = normalizeForSearch(hotelName);
    const byName = await this.prisma.location.findFirst({
      where: { normalizedName: normalized },
    });

    if (byName) {
      if (byName.hotelId) return 0;
      await this.prisma.location.update({ where: { id: byName.id }, data: { hotelId } });
      return 1;
    }

    await this.prisma.location.create({
      data: { name: hotelName, normalizedName: normalized, kind: 'HOTEL', hotelId },
    });
    return 1;
  }

  /** Stores the outcome so the UI can show when the catalogue was last good. */
  private async recordRun(result: SyncResult, status: 'SUCCESS' | 'FAILED'): Promise<void> {
    await this.prisma.systemSetting
      .upsert({
        where: { key: 'hotelDirectory.lastRun' },
        create: {
          key: 'hotelDirectory.lastRun',
          value: { ...result, status } as unknown as Prisma.InputJsonValue,
          description: 'Outcome of the most recent hotel directory synchronisation',
        },
        update: { value: { ...result, status } as unknown as Prisma.InputJsonValue },
      })
      .catch((err) => {
        // Losing the status row must not fail an otherwise good sync.
        this.logger.error({ err }, 'Could not record the hotel sync outcome');
      });
  }

  /** The last recorded outcome, for the sync panel. */
  async lastRun(): Promise<(SyncResult & { status: string }) | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: 'hotelDirectory.lastRun' },
    });
    return (row?.value as unknown as (SyncResult & { status: string }) | undefined) ?? null;
  }
}
