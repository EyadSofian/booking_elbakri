import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  allowedTransitions, buildPaginationMeta, calculateNights, canTransition,
  HOTEL_BOOKING_TRANSITIONS, HotelBookingStatus, normalizeForSearch,
  REFERENCE_PREFIXES, validateHotelDates,
  type PaginatedResponse, type HotelBookingStatus as BookingStatus,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AuditService } from '../audit/audit.service';
import { assertVersion } from '../../common/services/concurrency';
import { buildOrderBy, toSkipTake } from '../../common/services/pagination';
import { DomainError, InvalidStatusTransitionError, NotFoundError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

export interface HotelBookingListQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  q?: string;
  status?: string[];
  hotelId?: string;
  partnerId?: string;
  mealPlanId?: string;
  roomTypeId?: string;
  nationalityId?: string;
  checkInFrom?: Date;
  checkInTo?: Date;
  checkOutFrom?: Date;
  checkOutTo?: Date;
}

export interface StaySegmentInput {
  hotelId?: string | null;
  hotelRaw?: string | null;
  checkIn: Date;
  checkOut: Date;
  mealPlanId?: string | null;
  mealPlanRaw?: string | null;
  notes?: string | null;
  rooms?: Array<{
    roomTypeId?: string | null;
    roomTypeRaw?: string | null;
    quantity?: number;
    adults?: number | null;
    children?: number | null;
    occupantTravelerId?: string | null;
    notes?: string | null;
  }>;
}

const SORTABLE = ['reference', 'bookingDate', 'status', 'createdAt', 'updatedAt'] as const;

const BOOKING_INCLUDE = {
  hotel: { select: { id: true, name: true, nameAr: true, city: true } },
  partner: { select: { id: true, name: true, nameAr: true } },
  leadTraveler: {
    select: {
      id: true, fullName: true, phoneRaw: true, phoneNormalized: true, nationalityRaw: true,
      nationality: { select: { id: true, code: true, name: true, nameAr: true } },
    },
  },
  tripFile: { select: { id: true, reference: true, status: true } },
  staySegments: {
    orderBy: { sequence: 'asc' as const },
    include: {
      hotel: { select: { id: true, name: true, nameAr: true } },
      mealPlan: { select: { id: true, code: true, name: true, nameAr: true } },
      roomAllocations: { include: { roomType: { select: { id: true, code: true, name: true, nameAr: true } } } },
    },
  },
} satisfies Prisma.HotelBookingInclude;

@Injectable()
export class HotelBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  async list(query: HotelBookingListQuery): Promise<PaginatedResponse<unknown>> {
    const and: Prisma.HotelBookingWhereInput[] = [{ deletedAt: null }];

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.hotelId) {
      and.push({ OR: [{ hotelId: query.hotelId }, { staySegments: { some: { hotelId: query.hotelId } } }] });
    }
    if (query.partnerId) and.push({ partnerId: query.partnerId });
    if (query.nationalityId) and.push({ leadTraveler: { nationalityId: query.nationalityId } });
    if (query.mealPlanId) and.push({ staySegments: { some: { mealPlanId: query.mealPlanId } } });
    if (query.roomTypeId) {
      and.push({ staySegments: { some: { roomAllocations: { some: { roomTypeId: query.roomTypeId } } } } });
    }
    if (query.checkInFrom || query.checkInTo) {
      and.push({
        staySegments: {
          some: {
            checkIn: {
              ...(query.checkInFrom ? { gte: query.checkInFrom } : {}),
              ...(query.checkInTo ? { lte: query.checkInTo } : {}),
            },
          },
        },
      });
    }
    if (query.checkOutFrom || query.checkOutTo) {
      and.push({
        staySegments: {
          some: {
            checkOut: {
              ...(query.checkOutFrom ? { gte: query.checkOutFrom } : {}),
              ...(query.checkOutTo ? { lte: query.checkOutTo } : {}),
            },
          },
        },
      });
    }
    if (query.q) {
      const norm = normalizeForSearch(query.q);
      and.push({
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { confirmationNumber: { contains: query.q, mode: 'insensitive' } },
          { leadTraveler: { normalizedName: { contains: norm } } },
          { hotel: { normalizedName: { contains: norm } } },
          { hotelRaw: { contains: query.q, mode: 'insensitive' } },
          { tripFile: { reference: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.HotelBookingWhereInput = { AND: and };
    const { skip, take } = toSkipTake(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.hotelBooking.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortDir, SORTABLE, { createdAt: 'desc' }),
        include: BOOKING_INCLUDE,
      }),
      this.prisma.hotelBooking.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(id: string): Promise<unknown> {
    const booking = await this.prisma.hotelBooking.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...BOOKING_INCLUDE,
        attachments: { where: { deletedAt: null } },
        financialDocuments: {
          where: { deletedAt: null },
          include: { counterparty: { select: { id: true, name: true } } },
        },
        importRun: { select: { id: true, sourceFilename: true, createdAt: true } },
      },
    });
    if (!booking) throw new NotFoundError('Hotel booking', id);
    return booking;
  }

  /**
   * Creates a booking with one or more stay segments.
   *
   * Several segments under one booking is the normal case, not an edge case:
   * it is how a guest who moves between hotels is represented, and it is what
   * the legacy sheet's blank-name continuation rows meant.
   */
  async create(
    input: {
      tripFileId: string;
      leadTravelerId?: string | null;
      partnerId?: string | null;
      hotelId?: string | null;
      hotelRaw?: string | null;
      bookingDate?: Date | null;
      confirmationNumber?: string | null;
      securityApprovalRequired?: boolean;
      notes?: string | null;
      segments: StaySegmentInput[];
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    const trip = await this.prisma.tripFile.findFirst({
      where: { id: input.tripFileId, deletedAt: null },
      select: { id: true, leadTravelerId: true, partnerId: true },
    });
    if (!trip) throw new NotFoundError('Trip file', input.tripFileId);

    for (const segment of input.segments) {
      this.assertValidStay(segment, input.bookingDate ?? null);
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.next(REFERENCE_PREFIXES.HOTEL_BOOKING, tx);
      const created = await tx.hotelBooking.create({
        data: {
          reference,
          tripFileId: input.tripFileId,
          leadTravelerId: input.leadTravelerId ?? trip.leadTravelerId,
          partnerId: input.partnerId ?? trip.partnerId,
          hotelId: input.hotelId ?? null,
          hotelRaw: input.hotelRaw ?? null,
          bookingDate: input.bookingDate ?? null,
          confirmationNumber: input.confirmationNumber ?? null,
          securityApprovalRequired: input.securityApprovalRequired ?? false,
          notes: input.notes ?? null,
          status: HotelBookingStatus.DRAFT,
          createdById: ctx.actorId ?? null,
        },
      });

      let sequence = 1;
      for (const segment of input.segments) {
        await this.createSegment(tx, created.id, segment, sequence);
        sequence++;
      }
      await this.refreshTripDates(tx, input.tripFileId);
      return created;
    });

    await this.audit.record({
      action: 'HOTEL_BOOKING_CREATED', entityType: 'HotelBooking', entityId: booking.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: booking,
    });
    return this.findOne(booking.id);
  }

  private async createSegment(
    tx: Prisma.TransactionClient,
    hotelBookingId: string,
    segment: StaySegmentInput,
    sequence: number,
  ): Promise<string> {
    // Nights are always computed here, never accepted from the client.
    const nights = calculateNights(segment.checkIn, segment.checkOut);

    const created = await tx.hotelStaySegment.create({
      data: {
        hotelBookingId,
        hotelId: segment.hotelId ?? null,
        hotelRaw: segment.hotelRaw ?? null,
        checkIn: segment.checkIn,
        checkOut: segment.checkOut,
        nights,
        mealPlanId: segment.mealPlanId ?? null,
        mealPlanRaw: segment.mealPlanRaw ?? null,
        sequence,
        notes: segment.notes ?? null,
      },
      select: { id: true },
    });

    for (const room of segment.rooms ?? []) {
      await tx.roomAllocation.create({
        data: {
          hotelStaySegmentId: created.id,
          roomTypeId: room.roomTypeId ?? null,
          roomTypeRaw: room.roomTypeRaw ?? null,
          quantity: room.quantity ?? 1,
          adults: room.adults ?? null,
          children: room.children ?? null,
          occupantTravelerId: room.occupantTravelerId ?? null,
          notes: room.notes ?? null,
        },
      });
    }
    return created.id;
  }

  /**
   * Rejects a stay that breaks the date rules.
   *
   * This applies to data entered through the API. Historical imports take a
   * different path: they keep the original dates and raise a data-quality issue
   * instead, because the legacy file is evidence and must not be rewritten.
   */
  private assertValidStay(segment: StaySegmentInput, bookingDate: Date | null): void {
    const validation = validateHotelDates({
      checkIn: segment.checkIn,
      checkOut: segment.checkOut,
      bookingDate,
    });
    const blocking = validation.violations.filter((v) => v.severity === 'ERROR');
    if (blocking.length) {
      const first = blocking[0];
      throw new DomainError(first.code, first.message, 400, { violations: blocking });
    }
  }

  async addSegment(bookingId: string, segment: StaySegmentInput, ctx: ActorContext): Promise<unknown> {
    const booking = await this.prisma.hotelBooking.findFirst({
      where: { id: bookingId, deletedAt: null },
      select: { id: true, tripFileId: true, bookingDate: true, _count: { select: { staySegments: true } } },
    });
    if (!booking) throw new NotFoundError('Hotel booking', bookingId);
    this.assertValidStay(segment, booking.bookingDate);

    const segmentId = await this.prisma.$transaction(async (tx) => {
      const id = await this.createSegment(tx, bookingId, segment, booking._count.staySegments + 1);
      await this.refreshTripDates(tx, booking.tripFileId);
      return id;
    });

    await this.audit.record({
      action: 'HOTEL_STAY_SEGMENT_ADDED', entityType: 'HotelStaySegment', entityId: segmentId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      metadata: { hotelBookingId: bookingId },
    });
    return this.findOne(bookingId);
  }

  async updateSegment(
    segmentId: string,
    input: Partial<StaySegmentInput>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.hotelStaySegment.findUnique({
      where: { id: segmentId },
      include: { hotelBooking: { select: { id: true, tripFileId: true, bookingDate: true } } },
    });
    if (!before) throw new NotFoundError('Hotel stay segment', segmentId);

    const checkIn = input.checkIn ?? before.checkIn;
    const checkOut = input.checkOut ?? before.checkOut;
    if (checkIn && checkOut) {
      this.assertValidStay(
        { ...input, checkIn, checkOut } as StaySegmentInput,
        before.hotelBooking.bookingDate,
      );
    }

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.hotelStaySegment.update({
        where: { id: segmentId },
        data: {
          hotelId: input.hotelId,
          hotelRaw: input.hotelRaw,
          checkIn,
          checkOut,
          nights: checkIn && checkOut ? calculateNights(checkIn, checkOut) : null,
          mealPlanId: input.mealPlanId,
          mealPlanRaw: input.mealPlanRaw,
          notes: input.notes,
        },
      });
      await this.refreshTripDates(tx, before.hotelBooking.tripFileId);
      return updated;
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'HOTEL_STAY_SEGMENT_UPDATED', entityType: 'HotelStaySegment', entityId: segmentId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  async update(
    id: string,
    input: Partial<{
      leadTravelerId: string | null; partnerId: string | null;
      hotelId: string | null; hotelRaw: string | null;
      bookingDate: Date | null; confirmationNumber: string | null;
      securityApprovalRequired: boolean; notes: string | null; version: number;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.hotelBooking.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Hotel booking', id);
    assertVersion('hotel booking', input.version, before.version);

    const { version: _version, ...data } = input;
    const after = await this.prisma.hotelBooking.update({
      where: { id },
      data: { ...data, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'HOTEL_BOOKING_UPDATED', entityType: 'HotelBooking', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  async changeStatus(
    id: string,
    to: BookingStatus,
    reason: string | undefined,
    ctx: ActorContext,
  ): Promise<unknown> {
    const booking = await this.prisma.hotelBooking.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, tripFileId: true },
    });
    if (!booking) throw new NotFoundError('Hotel booking', id);

    const from = booking.status as BookingStatus;
    if (!canTransition(HOTEL_BOOKING_TRANSITIONS, from, to)) {
      throw new InvalidStatusTransitionError(
        'hotel booking', from, to, allowedTransitions(HOTEL_BOOKING_TRANSITIONS, from),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.hotelBooking.update({
        where: { id },
        data: { status: to, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
      });
      await tx.statusTransition.create({
        data: {
          entityType: 'HotelBooking', entityId: id, fromStatus: from, toStatus: to,
          reason: reason ?? null, actorId: ctx.actorId ?? null, tripFileId: booking.tripFileId,
        },
      });
      return result;
    });

    await this.audit.record({
      action: 'HOTEL_BOOKING_STATUS_CHANGED', entityType: 'HotelBooking', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { status: from }, after: { status: to }, metadata: { reason },
    });
    return updated;
  }

  /** Recomputes the owning trip's travel window from all of its services. */
  private async refreshTripDates(tx: Prisma.TransactionClient, tripFileId: string): Promise<void> {
    const segments = await tx.hotelStaySegment.findMany({
      where: { hotelBooking: { tripFileId, deletedAt: null } },
      select: { checkIn: true, checkOut: true },
    });
    const dates = segments.flatMap((s) => [s.checkIn, s.checkOut]).filter((d): d is Date => Boolean(d));
    if (!dates.length) return;
    const times = dates.map((d) => d.getTime());
    await tx.tripFile.updateMany({
      where: { id: tripFileId, travelDatesOverridden: false },
      data: { travelStartDate: new Date(Math.min(...times)), travelEndDate: new Date(Math.max(...times)) },
    });
  }

  allowedNextStatuses(current: BookingStatus): readonly BookingStatus[] {
    return allowedTransitions(HOTEL_BOOKING_TRANSITIONS, current);
  }
}
