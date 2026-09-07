import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AliasStatus, buildPaginationMeta, normalizeAliasKey, normalizeForSearch,
  type PaginatedResponse,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { AliasResolverService, type AliasEntityType } from './alias-resolver.service';
import type { ActorContext } from '../../common/services/request-context.service';

/** The master-data collections this service manages generically. */
export type MasterResource =
  | 'partners' | 'hotels' | 'room-types' | 'meal-plans'
  | 'locations' | 'excursions' | 'nationalities' | 'drivers' | 'vehicles';

const RESOURCE_TO_ALIAS_TYPE: Partial<Record<MasterResource, AliasEntityType>> = {
  partners: 'PARTNER',
  hotels: 'HOTEL',
  'room-types': 'ROOM_TYPE',
  'meal-plans': 'MEAL_PLAN',
  locations: 'LOCATION',
  excursions: 'EXCURSION',
  nationalities: 'NATIONALITY',
};

export interface MasterListQuery {
  page: number;
  pageSize: number;
  q?: string;
  includeInactive?: boolean;
}

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aliases: AliasResolverService,
  ) {}

  // -------------------------------------------------------------------------
  // Partners
  // -------------------------------------------------------------------------

  async listPartners(query: MasterListQuery): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.PartnerWhereInput = {
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          aliases: { where: { status: AliasStatus.APPROVED }, select: { id: true, alias: true } },
          _count: { select: { tripFiles: true, hotelBookings: true, transferBookings: true, excursionBookings: true, visaOrders: true } },
        },
      }),
      this.prisma.partner.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async createPartner(
    input: { name: string; nameAr?: string | null; type?: string; phone?: string | null; email?: string | null; notes?: string | null },
    ctx: ActorContext,
  ): Promise<unknown> {
    const normalizedName = normalizeForSearch(input.name);
    if (!normalizedName) throw new ValidationError('A partner needs a name.');

    const existing = await this.prisma.partner.findUnique({ where: { normalizedName } });
    if (existing) {
      throw new ConflictError('A partner with this name already exists.', { existingId: existing.id, existingName: existing.name });
    }

    const partner = await this.prisma.partner.create({
      data: {
        name: input.name,
        nameAr: input.nameAr ?? null,
        normalizedName,
        type: input.type ?? 'TRAVEL_AGENCY',
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
      },
    });
    this.aliases.resetCache();

    await this.audit.record({
      action: 'PARTNER_CREATED', entityType: 'Partner', entityId: partner.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: partner,
    });
    return partner;
  }

  // -------------------------------------------------------------------------
  // Hotels
  // -------------------------------------------------------------------------

  async listHotels(query: MasterListQuery): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.HotelWhereInput = {
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hotel.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          aliases: { where: { status: AliasStatus.APPROVED }, select: { id: true, alias: true } },
          _count: { select: { bookings: true, staySegments: true } },
        },
      }),
      this.prisma.hotel.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async createHotel(
    input: { name: string; nameAr?: string | null; city?: string | null; area?: string | null; starRating?: number | null; phone?: string | null; notes?: string | null },
    ctx: ActorContext,
  ): Promise<unknown> {
    const normalizedName = normalizeForSearch(input.name);
    if (!normalizedName) throw new ValidationError('A hotel needs a name.');

    const existing = await this.prisma.hotel.findUnique({ where: { normalizedName } });
    if (existing) {
      throw new ConflictError('A hotel with this name already exists.', { existingId: existing.id, existingName: existing.name });
    }

    const hotel = await this.prisma.hotel.create({
      data: {
        name: input.name,
        nameAr: input.nameAr ?? null,
        normalizedName,
        city: input.city ?? null,
        area: input.area ?? null,
        starRating: input.starRating ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
    });
    this.aliases.resetCache();

    await this.audit.record({
      action: 'HOTEL_CREATED', entityType: 'Hotel', entityId: hotel.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: hotel,
    });
    return hotel;
  }

  // -------------------------------------------------------------------------
  // Simple lookups
  // -------------------------------------------------------------------------

  async listRoomTypes(query: MasterListQuery) {
    return this.prisma.roomType.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { aliases: { select: { id: true, alias: true, status: true } } },
    });
  }

  async listMealPlans(query: MasterListQuery) {
    return this.prisma.mealPlan.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { aliases: { select: { id: true, alias: true, status: true } } },
    });
  }

  async listLocations(query: MasterListQuery & { kind?: string }) {
    return this.prisma.location.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
      include: { aliases: { select: { id: true, alias: true, status: true } } },
    });
  }

  async listExcursionCatalog(query: MasterListQuery) {
    return this.prisma.excursionCatalogItem.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { aliases: { select: { id: true, alias: true, status: true } } },
    });
  }

  async listNationalities(query: MasterListQuery) {
    return this.prisma.nationality.findMany({
      where: query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {},
      orderBy: { name: 'asc' },
      include: { aliases: { select: { id: true, alias: true, status: true } } },
    });
  }

  async listDrivers(query: MasterListQuery) {
    return this.prisma.driver.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.q ? { normalizedName: { contains: normalizeForSearch(query.q) } } : {}),
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async listVehicles(query: MasterListQuery) {
    return this.prisma.vehicle.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.q ? { plateNumber: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { plateNumber: 'asc' },
    });
  }

  async createDriver(
    input: { fullName: string; phone?: string | null; licenseNumber?: string | null; notes?: string | null },
    ctx: ActorContext,
  ) {
    const driver = await this.prisma.driver.create({
      data: {
        fullName: input.fullName,
        normalizedName: normalizeForSearch(input.fullName),
        phone: input.phone ?? null,
        phoneNormalized: input.phone ? input.phone.replace(/\D/g, '') : null,
        licenseNumber: input.licenseNumber ?? null,
        notes: input.notes ?? null,
      },
    });
    await this.audit.record({
      action: 'DRIVER_CREATED', entityType: 'Driver', entityId: driver.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, after: driver,
    });
    return driver;
  }

  async createVehicle(
    input: { plateNumber: string; model?: string | null; capacity?: number | null; type?: string | null },
    ctx: ActorContext,
  ) {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        plateNumber: input.plateNumber,
        model: input.model ?? null,
        capacity: input.capacity ?? null,
        type: input.type ?? null,
      },
    });
    await this.audit.record({
      action: 'VEHICLE_CREATED', entityType: 'Vehicle', entityId: vehicle.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, after: vehicle,
    });
    return vehicle;
  }

  // -------------------------------------------------------------------------
  // Alias review queue
  // -------------------------------------------------------------------------

  /**
   * Values from the legacy files that could not be resolved automatically.
   * Each row is a decision waiting for a person — nothing here has been applied.
   */
  async listAliasSuggestions(query: {
    page: number; pageSize: number; entityType?: string; status?: string;
  }): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.AliasMappingWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      status: query.status ?? AliasStatus.SUGGESTED,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.aliasMapping.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ occurrences: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.aliasMapping.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  /** Links an unresolved value to an existing master record. */
  async approveAlias(mappingId: string, targetId: string, ctx: ActorContext): Promise<unknown> {
    const mapping = await this.prisma.aliasMapping.findUnique({ where: { id: mappingId } });
    if (!mapping) throw new NotFoundError('Alias suggestion', mappingId);
    if (!ctx.actorId) throw new ValidationError('An approving user is required.');

    await this.aliases.approve(mappingId, targetId, ctx.actorId);

    await this.audit.record({
      action: 'ALIAS_APPROVED', entityType: 'AliasMapping', entityId: mappingId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { status: mapping.status },
      after: { status: AliasStatus.APPROVED, resolvedId: targetId },
      metadata: { rawValue: mapping.rawValue, entityType: mapping.entityType },
    });
    return this.prisma.aliasMapping.findUnique({ where: { id: mappingId } });
  }

  /**
   * Creates a new master record from an unresolved value and links it.
   * Used when the legacy value turns out to be a genuinely new hotel or agency.
   */
  async promoteAliasToNewRecord(mappingId: string, ctx: ActorContext): Promise<unknown> {
    const mapping = await this.prisma.aliasMapping.findUnique({ where: { id: mappingId } });
    if (!mapping) throw new NotFoundError('Alias suggestion', mappingId);
    if (!ctx.actorId) throw new ValidationError('An approving user is required.');

    const name = mapping.rawValue;
    const normalizedName = normalizeForSearch(name);
    let targetId: string;

    switch (mapping.entityType as AliasEntityType) {
      case 'PARTNER': {
        const created = await this.prisma.partner.create({ data: { name, normalizedName } });
        targetId = created.id;
        break;
      }
      case 'HOTEL': {
        const created = await this.prisma.hotel.create({ data: { name, normalizedName } });
        targetId = created.id;
        break;
      }
      case 'ROOM_TYPE': {
        const created = await this.prisma.roomType.create({
          data: { code: normalizedName.slice(0, 40).replace(/\s/g, '_').toUpperCase(), name, normalizedName },
        });
        targetId = created.id;
        break;
      }
      case 'MEAL_PLAN': {
        const created = await this.prisma.mealPlan.create({
          data: { code: normalizedName.slice(0, 40).replace(/\s/g, '_').toUpperCase(), name, normalizedName },
        });
        targetId = created.id;
        break;
      }
      case 'LOCATION': {
        const created = await this.prisma.location.create({ data: { name, normalizedName } });
        targetId = created.id;
        break;
      }
      case 'EXCURSION': {
        const created = await this.prisma.excursionCatalogItem.create({
          data: { code: normalizedName.slice(0, 40).replace(/\s/g, '_').toUpperCase(), name, normalizedName },
        });
        targetId = created.id;
        break;
      }
      case 'NATIONALITY': {
        const created = await this.prisma.nationality.create({
          data: { code: normalizedName.slice(0, 10).toUpperCase(), name, normalizedName },
        });
        targetId = created.id;
        break;
      }
      default:
        throw new ValidationError(`Cannot create a master record for entity type ${mapping.entityType}.`);
    }

    await this.aliases.approve(mappingId, targetId, ctx.actorId);
    await this.audit.record({
      action: 'MASTER_RECORD_CREATED_FROM_ALIAS', entityType: mapping.entityType, entityId: targetId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { name, mappingId },
    });
    return { id: targetId, name };
  }

  async rejectAlias(mappingId: string, ctx: ActorContext): Promise<unknown> {
    const updated = await this.prisma.aliasMapping.update({
      where: { id: mappingId },
      data: { status: AliasStatus.REJECTED, resolvedBy: ctx.actorId ?? null, resolvedAt: new Date() },
    });
    await this.audit.record({
      action: 'ALIAS_REJECTED', entityType: 'AliasMapping', entityId: mappingId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, after: { status: AliasStatus.REJECTED },
    });
    return updated;
  }

  /** Adds an alias by hand to an existing master record. */
  async addAlias(
    entityType: AliasEntityType,
    targetId: string,
    alias: string,
    ctx: ActorContext,
  ): Promise<unknown> {
    const aliasKey = normalizeAliasKey(alias);
    if (!aliasKey) throw new ValidationError('An alias cannot be empty.');

    const data = { alias, aliasKey, status: AliasStatus.APPROVED };
    let created: unknown;

    switch (entityType) {
      case 'PARTNER':
        created = await this.prisma.partnerAlias.create({
          data: { ...data, partnerId: targetId, source: 'MANUAL', approvedBy: ctx.actorId, approvedAt: new Date() },
        });
        break;
      case 'HOTEL':
        created = await this.prisma.hotelAlias.create({
          data: { ...data, hotelId: targetId, source: 'MANUAL', approvedBy: ctx.actorId, approvedAt: new Date() },
        });
        break;
      case 'ROOM_TYPE':
        created = await this.prisma.roomTypeAlias.create({ data: { ...data, roomTypeId: targetId } });
        break;
      case 'MEAL_PLAN':
        created = await this.prisma.mealPlanAlias.create({ data: { ...data, mealPlanId: targetId } });
        break;
      case 'LOCATION':
        created = await this.prisma.locationAlias.create({ data: { ...data, locationId: targetId } });
        break;
      case 'EXCURSION':
        created = await this.prisma.excursionAlias.create({ data: { ...data, catalogItemId: targetId } });
        break;
      case 'NATIONALITY':
        created = await this.prisma.nationalityAlias.create({ data: { ...data, nationalityId: targetId } });
        break;
    }

    this.aliases.resetCache();
    await this.audit.record({
      action: 'ALIAS_ADDED', entityType, entityId: targetId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, after: { alias, aliasKey },
    });
    return created;
  }

  aliasTypeFor(resource: MasterResource): AliasEntityType | undefined {
    return RESOURCE_TO_ALIAS_TYPE[resource];
  }
}
