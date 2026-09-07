import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  allowedTransitions, buildPaginationMeta, canTransition, normalizeForSearch,
  REFERENCE_PREFIXES, TRANSFER_TRANSITIONS, TransferStatus,
  type PaginatedResponse, type TransferStatus as LegStatus,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AuditService } from '../audit/audit.service';
import { assertVersion } from '../../common/services/concurrency';
import { buildOrderBy, toSkipTake } from '../../common/services/pagination';
import { InvalidStatusTransitionError, NotFoundError, ValidationError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

export interface LegListQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  q?: string;
  status?: string[];
  direction?: string;
  dateFrom?: Date;
  dateTo?: Date;
  locationId?: string;
  driverId?: string;
  vehicleId?: string;
  partnerId?: string;
  unassignedOnly?: boolean;
  missingPickupOnly?: boolean;
}

const SORTABLE = ['serviceDate', 'pickupTimeMinutes', 'status', 'direction', 'flightNumber', 'createdAt'] as const;

const LEG_INCLUDE = {
  fromLocation: { select: { id: true, name: true, nameAr: true, kind: true } },
  toLocation: { select: { id: true, name: true, nameAr: true, kind: true } },
  driver: { select: { id: true, fullName: true, phone: true } },
  vehicle: { select: { id: true, plateNumber: true, model: true, capacity: true } },
  transferBooking: {
    select: {
      id: true, reference: true, paxCount: true, notes: true,
      tripFile: { select: { id: true, reference: true } },
      partner: { select: { id: true, name: true, nameAr: true } },
      leadTraveler: {
        select: { id: true, fullName: true, phoneRaw: true, phoneNormalized: true, nationalityRaw: true },
      },
    },
  },
} satisfies Prisma.TransferLegInclude;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Bookings
  // -------------------------------------------------------------------------

  async listBookings(query: {
    page: number; pageSize: number; q?: string; status?: string[]; partnerId?: string; tripFileId?: string;
  }): Promise<PaginatedResponse<unknown>> {
    const and: Prisma.TransferBookingWhereInput[] = [{ deletedAt: null }];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.partnerId) and.push({ partnerId: query.partnerId });
    if (query.tripFileId) and.push({ tripFileId: query.tripFileId });
    if (query.q) {
      const norm = normalizeForSearch(query.q);
      and.push({
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { leadTraveler: { normalizedName: { contains: norm } } },
          { legs: { some: { flightNumber: { contains: query.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.TransferBookingWhereInput = { AND: and };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transferBooking.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
          partner: { select: { id: true, name: true } },
          tripFile: { select: { id: true, reference: true } },
          legs: {
            orderBy: [{ serviceDate: 'asc' }, { sequence: 'asc' }],
            include: {
              fromLocation: { select: { name: true } },
              toLocation: { select: { name: true } },
              driver: { select: { id: true, fullName: true } },
              vehicle: { select: { id: true, plateNumber: true } },
            },
          },
        },
      }),
      this.prisma.transferBooking.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async findBooking(id: string): Promise<unknown> {
    const booking = await this.prisma.transferBooking.findFirst({
      where: { id, deletedAt: null },
      include: {
        leadTraveler: { include: { nationality: true } },
        partner: true,
        tripFile: { select: { id: true, reference: true, status: true } },
        legs: {
          orderBy: [{ serviceDate: 'asc' }, { sequence: 'asc' }],
          include: LEG_INCLUDE,
        },
        attachments: { where: { deletedAt: null } },
      },
    });
    if (!booking) throw new NotFoundError('Transfer booking', id);
    return booking;
  }

  async createBooking(
    input: {
      tripFileId: string;
      leadTravelerId?: string | null;
      partnerId?: string | null;
      paxCount?: number | null;
      notes?: string | null;
      legs?: Array<CreateLegInput>;
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    const trip = await this.prisma.tripFile.findFirst({
      where: { id: input.tripFileId, deletedAt: null },
      select: { id: true, leadTravelerId: true, partnerId: true },
    });
    if (!trip) throw new NotFoundError('Trip file', input.tripFileId);

    const booking = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.next(REFERENCE_PREFIXES.TRANSFER, tx);
      const created = await tx.transferBooking.create({
        data: {
          reference,
          tripFileId: input.tripFileId,
          leadTravelerId: input.leadTravelerId ?? trip.leadTravelerId,
          partnerId: input.partnerId ?? trip.partnerId,
          paxCount: input.paxCount ?? null,
          notes: input.notes ?? null,
          status: TransferStatus.DRAFT,
          createdById: ctx.actorId ?? null,
        },
      });

      let sequence = 1;
      for (const leg of input.legs ?? []) {
        await tx.transferLeg.create({
          data: this.legData(created.id, leg, sequence, input.paxCount ?? null),
        });
        sequence++;
      }
      return created;
    });

    await this.audit.record({
      action: 'TRANSFER_BOOKING_CREATED', entityType: 'TransferBooking', entityId: booking.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: booking,
    });
    return this.findBooking(booking.id);
  }

  async updateBooking(
    id: string,
    input: Partial<{
      leadTravelerId: string | null; partnerId: string | null;
      paxCount: number | null; notes: string | null; version: number;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.transferBooking.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Transfer booking', id);
    assertVersion('transfer booking', input.version, before.version);

    const { version: _version, ...data } = input;
    const after = await this.prisma.transferBooking.update({
      where: { id },
      data: { ...data, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'TRANSFER_BOOKING_UPDATED', entityType: 'TransferBooking', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  // -------------------------------------------------------------------------
  // Legs
  // -------------------------------------------------------------------------

  /** The transfer list and the daily dispatch board are both built from this. */
  async listLegs(query: LegListQuery): Promise<PaginatedResponse<unknown>> {
    const and: Prisma.TransferLegWhereInput[] = [{ transferBooking: { deletedAt: null } }];

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.direction) and.push({ direction: query.direction });
    if (query.dateFrom) and.push({ serviceDate: { gte: query.dateFrom } });
    if (query.dateTo) and.push({ serviceDate: { lte: query.dateTo } });
    if (query.driverId) and.push({ driverId: query.driverId });
    if (query.vehicleId) and.push({ vehicleId: query.vehicleId });
    if (query.partnerId) and.push({ transferBooking: { partnerId: query.partnerId, deletedAt: null } });
    if (query.locationId) {
      and.push({ OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] });
    }
    if (query.unassignedOnly) and.push({ driverId: null });
    if (query.missingPickupOnly) and.push({ pickupTimeMinutes: null });

    if (query.q) {
      const norm = normalizeForSearch(query.q);
      and.push({
        OR: [
          { flightNumber: { contains: query.q, mode: 'insensitive' } },
          { fromRaw: { contains: query.q, mode: 'insensitive' } },
          { toRaw: { contains: query.q, mode: 'insensitive' } },
          { fromLocation: { normalizedName: { contains: norm } } },
          { toLocation: { normalizedName: { contains: norm } } },
          { transferBooking: { leadTraveler: { normalizedName: { contains: norm } } } },
          { transferBooking: { reference: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.TransferLegWhereInput = { AND: and };
    const { skip, take } = toSkipTake(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transferLeg.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortDir, SORTABLE, { serviceDate: 'asc' }),
        include: LEG_INCLUDE,
      }),
      this.prisma.transferLeg.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async addLeg(bookingId: string, input: CreateLegInput, ctx: ActorContext): Promise<unknown> {
    const booking = await this.prisma.transferBooking.findFirst({
      where: { id: bookingId, deletedAt: null },
      select: { id: true, paxCount: true, _count: { select: { legs: true } } },
    });
    if (!booking) throw new NotFoundError('Transfer booking', bookingId);

    const leg = await this.prisma.transferLeg.create({
      data: this.legData(bookingId, input, booking._count.legs + 1, booking.paxCount),
      include: LEG_INCLUDE,
    });

    await this.audit.record({
      action: 'TRANSFER_LEG_CREATED', entityType: 'TransferLeg', entityId: leg.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: leg, metadata: { transferBookingId: bookingId },
    });
    return leg;
  }

  private legData(
    transferBookingId: string,
    input: CreateLegInput,
    sequence: number,
    fallbackPax: number | null,
  ): Prisma.TransferLegUncheckedCreateInput {
    // A leg without a date cannot be dispatched, so it is required up front for
    // anything created through the API (legacy imports keep their raw value).
    if (!input.serviceDate) {
      throw new ValidationError('A transfer leg must have a service date.');
    }
    return {
      transferBookingId,
      sequence,
      direction: input.direction ?? 'OTHER',
      fromLocationId: input.fromLocationId ?? null,
      fromRaw: input.fromRaw ?? null,
      toLocationId: input.toLocationId ?? null,
      toRaw: input.toRaw ?? null,
      serviceDate: input.serviceDate,
      pickupTimeMinutes: input.pickupTimeMinutes ?? null,
      flightNumber: input.flightNumber ?? null,
      paxCount: input.paxCount ?? fallbackPax,
      driverId: input.driverId ?? null,
      vehicleId: input.vehicleId ?? null,
      meetAndGreet: input.meetAndGreet ?? false,
      flowerBouquet: input.flowerBouquet ?? false,
      securityApprovalRequired: input.securityApprovalRequired ?? false,
      status: input.driverId ? TransferStatus.ASSIGNED : TransferStatus.SCHEDULED,
      notes: input.notes ?? null,
    };
  }

  async updateLeg(
    id: string,
    input: Partial<CreateLegInput & { version: number }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.transferLeg.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Transfer leg', id);
    assertVersion('transfer leg', input.version, before.version);

    const { version: _version, ...data } = input;
    const after = await this.prisma.transferLeg.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: LEG_INCLUDE,
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'TRANSFER_LEG_UPDATED', entityType: 'TransferLeg', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  /** Assigns a driver and vehicle, moving the leg to ASSIGNED. */
  async assignLeg(
    id: string,
    input: { driverId?: string | null; vehicleId?: string | null; version?: number },
    ctx: ActorContext,
  ): Promise<unknown> {
    const leg = await this.prisma.transferLeg.findUnique({ where: { id } });
    if (!leg) throw new NotFoundError('Transfer leg', id);
    assertVersion('transfer leg', input.version, leg.version);

    const from = leg.status as LegStatus;
    const to: LegStatus = input.driverId ? TransferStatus.ASSIGNED : TransferStatus.SCHEDULED;
    if (from !== to && !canTransition(TRANSFER_TRANSITIONS, from, to)) {
      throw new InvalidStatusTransitionError(
        'transfer leg', from, to, allowedTransitions(TRANSFER_TRANSITIONS, from),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transferLeg.update({
        where: { id },
        data: {
          driverId: input.driverId ?? null,
          vehicleId: input.vehicleId ?? null,
          status: to,
          version: { increment: 1 },
        },
        include: LEG_INCLUDE,
      });
      if (from !== to) {
        await tx.statusTransition.create({
          data: {
            entityType: 'TransferLeg', entityId: id, fromStatus: from, toStatus: to,
            reason: 'Driver assignment', actorId: ctx.actorId ?? null,
            tripFileId: result.transferBooking.tripFile?.id ?? null,
          },
        });
      }
      return result;
    });

    await this.audit.record({
      action: 'TRANSFER_ASSIGNED', entityType: 'TransferLeg', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { driverId: leg.driverId, vehicleId: leg.vehicleId, status: from },
      after: { driverId: input.driverId, vehicleId: input.vehicleId, status: to },
    });
    return updated;
  }

  /**
   * Moves a leg through the dispatch workflow.
   *
   * The state machine is enforced here: a completed or dispatched leg can never
   * be pushed back to draft, because the record of what actually happened on
   * the ground has to stay truthful.
   */
  async changeLegStatus(
    id: string,
    to: LegStatus,
    reason: string | undefined,
    ctx: ActorContext,
  ): Promise<unknown> {
    const leg = await this.prisma.transferLeg.findUnique({
      where: { id },
      include: { transferBooking: { select: { tripFileId: true } } },
    });
    if (!leg) throw new NotFoundError('Transfer leg', id);

    const from = leg.status as LegStatus;
    if (!canTransition(TRANSFER_TRANSITIONS, from, to)) {
      throw new InvalidStatusTransitionError(
        'transfer leg', from, to, allowedTransitions(TRANSFER_TRANSITIONS, from),
      );
    }
    if (to === TransferStatus.DISPATCHED && !leg.driverId) {
      throw new ValidationError('A driver must be assigned before a transfer can be dispatched.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transferLeg.update({
        where: { id },
        data: { status: to, version: { increment: 1 } },
        include: LEG_INCLUDE,
      });
      await tx.statusTransition.create({
        data: {
          entityType: 'TransferLeg', entityId: id, fromStatus: from, toStatus: to,
          reason: reason ?? null, actorId: ctx.actorId ?? null,
          tripFileId: leg.transferBooking.tripFileId,
        },
      });
      return result;
    });

    await this.audit.record({
      action: 'TRANSFER_STATUS_CHANGED', entityType: 'TransferLeg', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { status: from }, after: { status: to }, metadata: { reason },
    });
    return updated;
  }

  allowedNextStatuses(current: LegStatus): readonly LegStatus[] {
    return allowedTransitions(TRANSFER_TRANSITIONS, current);
  }
}

export interface CreateLegInput {
  direction?: string;
  fromLocationId?: string | null;
  fromRaw?: string | null;
  toLocationId?: string | null;
  toRaw?: string | null;
  serviceDate?: Date;
  pickupTimeMinutes?: number | null;
  flightNumber?: string | null;
  paxCount?: number | null;
  driverId?: string | null;
  vehicleId?: string | null;
  meetAndGreet?: boolean;
  flowerBouquet?: boolean;
  securityApprovalRequired?: boolean;
  notes?: string | null;
}
