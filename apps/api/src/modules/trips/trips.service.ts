import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PERMISSIONS, PaymentStatus, REFERENCE_PREFIXES, TRIP_TRANSITIONS, TripFileStatus, allowedTransitions, buildPaginationMeta, calculateMargin, calculateOutstanding, calculatePaid, canTransition, normalizeForSearch, type PaginatedResponse, type TripFileStatus as TripStatus,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AuditService } from '../audit/audit.service';
import { assertVersion } from '../../common/services/concurrency';
import { buildOrderBy, toSkipTake } from '../../common/services/pagination';
import { InvalidStatusTransitionError, NotFoundError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

export interface TripListQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  q?: string;
  status?: string[];
  partnerId?: string;
  hotelId?: string;
  travelFrom?: Date;
  travelTo?: Date;
}

const SORTABLE = [
  'reference', 'status', 'travelStartDate', 'travelEndDate', 'createdAt', 'updatedAt',
] as const;

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TripListQuery): Promise<PaginatedResponse<unknown>> {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tripFile.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortDir, SORTABLE, { createdAt: 'desc' }),
        include: {
          leadTraveler: {
            select: {
              id: true, fullName: true, phoneNormalized: true, phoneRaw: true, nationalityRaw: true,
              nationality: { select: { code: true, name: true, nameAr: true } },
            },
          },
          partner: { select: { id: true, name: true, nameAr: true } },
          _count: {
            select: {
              hotelBookings: true, transferBookings: true,
              excursionBookings: true, visaOrders: true, financialDocuments: true,
            },
          },
          hotelBookings: {
            where: { deletedAt: null },
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: { hotel: { select: { id: true, name: true } }, hotelRaw: true },
          },
        },
      }),
      this.prisma.tripFile.count({ where }),
    ]);

    return { data: rows, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  private buildWhere(query: TripListQuery): Prisma.TripFileWhereInput {
    const and: Prisma.TripFileWhereInput[] = [{ deletedAt: null }];

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.partnerId) and.push({ partnerId: query.partnerId });
    if (query.hotelId) and.push({ hotelBookings: { some: { hotelId: query.hotelId, deletedAt: null } } });
    if (query.travelFrom) and.push({ travelEndDate: { gte: query.travelFrom } });
    if (query.travelTo) and.push({ travelStartDate: { lte: query.travelTo } });

    if (query.q) {
      const q = query.q.trim();
      const norm = normalizeForSearch(q);
      const digits = q.replace(/\D/g, '');
      const or: Prisma.TripFileWhereInput[] = [
        { reference: { contains: q, mode: 'insensitive' } },
        { leadTraveler: { normalizedName: { contains: norm } } },
        { partner: { normalizedName: { contains: norm } } },
        { hotelBookings: { some: { hotel: { normalizedName: { contains: norm } } } } },
        { hotelBookings: { some: { hotelRaw: { contains: q, mode: 'insensitive' } } } },
        { transferBookings: { some: { legs: { some: { flightNumber: { contains: q, mode: 'insensitive' } } } } } },
      ];
      if (digits.length >= 4) {
        or.push({ leadTraveler: { phoneDigits: { contains: digits } } });
      }
      and.push({ OR: or });
    }

    return { AND: and };
  }

  /** The full operational file, including the chronological timeline. */
  async findOne(id: string, permissions: string[] = []): Promise<unknown> {
    const trip = await this.prisma.tripFile.findFirst({
      where: { id, deletedAt: null },
      include: {
        leadTraveler: { include: { nationality: true } },
        partner: true,
        travelers: { include: { traveler: { include: { nationality: true } } } },
        hotelBookings: {
          where: { deletedAt: null },
          include: {
            hotel: true,
            partner: { select: { id: true, name: true } },
            staySegments: {
              orderBy: { sequence: 'asc' },
              include: { hotel: true, mealPlan: true, roomAllocations: { include: { roomType: true } } },
            },
          },
        },
        transferBookings: {
          where: { deletedAt: null },
          include: {
            legs: {
              orderBy: [{ serviceDate: 'asc' }, { sequence: 'asc' }],
              include: { fromLocation: true, toLocation: true, driver: true, vehicle: true },
            },
          },
        },
        excursionBookings: {
          where: { deletedAt: null },
          include: {
            hotel: true,
            items: { orderBy: [{ serviceDate: 'asc' }, { sequence: 'asc' }], include: { catalogItem: true } },
          },
        },
        visaOrders: { where: { deletedAt: null }, include: { applicants: true } },
        financialDocuments: {
          where: { deletedAt: null },
          include: { counterparty: true, payments: { orderBy: { paymentDate: 'asc' } } },
        },
        attachments: { where: { deletedAt: null } },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!trip) throw new NotFoundError('Trip file', id);

    // Derived money is computed here, not in the browser: the balance must come
    // from the ledger, and a component adding up payments itself is how the two
    // drift apart.
    const financialDocuments = trip.financialDocuments.map((doc) => {
      const payments = doc.payments.map((p) => ({
        amount: Number(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const paidAmount = calculatePaid(payments);
      return {
        ...doc,
        paidAmount,
        outstanding: calculateOutstanding(Number(doc.totalAmount), payments),
      };
    });

    // Visa amounts are omitted entirely without the permission — not hidden by
    // the client, which would still have received them.
    const canSeeVisaFinance =
      permissions.includes(PERMISSIONS.VISAS_FINANCE_READ) ||
      permissions.includes(PERMISSIONS.FINANCE_READ);

    const visaOrders = trip.visaOrders.map((order) => {
      if (!canSeeVisaFinance) {
        const { netAmount: _n, sellAmount: _s, ...rest } = order;
        return { ...rest, netAmount: null, sellAmount: null, margin: null };
      }
      const net = order.netAmount === null ? null : Number(order.netAmount);
      const sell = order.sellAmount === null ? null : Number(order.sellAmount);
      return { ...order, netAmount: net, sellAmount: sell, margin: calculateMargin(sell, net) };
    });

    return {
      ...trip,
      financialDocuments,
      visaOrders,
      timeline: this.buildTimeline(trip),
    };
  }

  /**
   * Builds the chronological view of the trip from its actual child services,
   * so the overview reflects what is really booked rather than a stored copy
   * that could drift out of date.
   */
  private buildTimeline(trip: {
    hotelBookings: Array<{
      id: string; hotel: { name: string } | null; hotelRaw: string | null;
      staySegments: Array<{
        id: string; checkIn: Date | null; checkOut: Date | null;
        hotel: { name: string } | null; hotelRaw: string | null;
      }>;
    }>;
    transferBookings: Array<{
      id: string;
      legs: Array<{
        id: string; serviceDate: Date | null; pickupTimeMinutes: number | null;
        direction: string; fromRaw: string | null; toRaw: string | null;
        flightNumber: string | null; status: string;
        fromLocation: { name: string } | null; toLocation: { name: string } | null;
      }>;
    }>;
    excursionBookings: Array<{
      id: string;
      items: Array<{
        id: string; serviceDate: Date | null; serviceTimeMinutes: number | null;
        activityRaw: string | null; status: string; catalogItem: { name: string } | null;
      }>;
    }>;
    visaOrders: Array<{ id: string; serviceDate: Date | null; status: string; destinationRaw: string | null }>;
  }): Array<{
    date: string | null; time: string | null; type: string;
    title: string; detail: string | null; entityType: string; entityId: string; status?: string;
  }> {
    const events: Array<{
      date: string | null; time: string | null; type: string; title: string;
      detail: string | null; entityType: string; entityId: string; status?: string; sortKey: number;
    }> = [];

    const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const hhmm = (m: number | null) =>
      m === null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    // Undated services sort last rather than jumping to the top of the day.
    const sortKey = (d: Date | null, m: number | null) =>
      d ? d.getTime() + (m ?? 0) * 60000 : Number.MAX_SAFE_INTEGER;

    for (const booking of trip.hotelBookings) {
      for (const seg of booking.staySegments) {
        const hotelName =
          seg.hotel?.name ?? seg.hotelRaw ?? booking.hotel?.name ?? booking.hotelRaw ?? 'Hotel';
        if (seg.checkIn) {
          events.push({
            date: dayKey(seg.checkIn), time: null, type: 'HOTEL_CHECK_IN', title: hotelName,
            detail: 'Check-in', entityType: 'HotelStaySegment', entityId: seg.id,
            sortKey: sortKey(seg.checkIn, 14 * 60),
          });
        }
        if (seg.checkOut) {
          events.push({
            date: dayKey(seg.checkOut), time: null, type: 'HOTEL_CHECK_OUT', title: hotelName,
            detail: 'Check-out', entityType: 'HotelStaySegment', entityId: seg.id,
            sortKey: sortKey(seg.checkOut, 12 * 60),
          });
        }
      }
    }

    for (const booking of trip.transferBookings) {
      for (const leg of booking.legs) {
        const from = leg.fromLocation?.name ?? leg.fromRaw ?? '?';
        const to = leg.toLocation?.name ?? leg.toRaw ?? '?';
        events.push({
          date: dayKey(leg.serviceDate), time: hhmm(leg.pickupTimeMinutes),
          type: `TRANSFER_${leg.direction}`, title: `${from} → ${to}`,
          detail: leg.flightNumber ? `Flight ${leg.flightNumber}` : null,
          entityType: 'TransferLeg', entityId: leg.id, status: leg.status,
          sortKey: sortKey(leg.serviceDate, leg.pickupTimeMinutes),
        });
      }
    }

    for (const booking of trip.excursionBookings) {
      for (const item of booking.items) {
        events.push({
          date: dayKey(item.serviceDate), time: hhmm(item.serviceTimeMinutes), type: 'EXCURSION',
          title: item.catalogItem?.name ?? item.activityRaw ?? 'Excursion', detail: null,
          entityType: 'ExcursionItem', entityId: item.id, status: item.status,
          sortKey: sortKey(item.serviceDate, item.serviceTimeMinutes),
        });
      }
    }

    for (const visa of trip.visaOrders) {
      events.push({
        date: dayKey(visa.serviceDate), time: null, type: 'VISA',
        title: visa.destinationRaw ? `Visa — ${visa.destinationRaw}` : 'Visa',
        detail: null, entityType: 'VisaOrder', entityId: visa.id, status: visa.status,
        sortKey: sortKey(visa.serviceDate, 0),
      });
    }

    return events
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey: _sortKey, ...event }) => event);
  }

  async create(
    input: {
      leadTravelerId?: string | null;
      partnerId?: string | null;
      status?: TripStatus;
      paxCount?: number | null;
      childCount?: number | null;
      notes?: string | null;
      travelStartDate?: Date | null;
      travelEndDate?: Date | null;
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    const trip = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.next(REFERENCE_PREFIXES.TRIP, tx);
      const created = await tx.tripFile.create({
        data: {
          reference,
          leadTravelerId: input.leadTravelerId ?? null,
          partnerId: input.partnerId ?? null,
          status: input.status ?? TripFileStatus.DRAFT,
          paxCount: input.paxCount ?? null,
          childCount: input.childCount ?? null,
          notes: input.notes ?? null,
          travelStartDate: input.travelStartDate ?? null,
          travelEndDate: input.travelEndDate ?? null,
          travelDatesOverridden: Boolean(input.travelStartDate || input.travelEndDate),
          createdById: ctx.actorId ?? null,
        },
      });
      if (input.leadTravelerId) {
        await tx.tripTraveler.create({
          data: { tripFileId: created.id, travelerId: input.leadTravelerId, role: 'LEAD' },
        });
      }
      return created;
    });

    await this.audit.record({
      action: 'TRIP_CREATED', entityType: 'TripFile', entityId: trip.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      ipAddress: ctx.ipAddress, after: trip,
    });
    return trip;
  }

  async update(
    id: string,
    input: Partial<{
      leadTravelerId: string | null;
      partnerId: string | null;
      paxCount: number | null;
      childCount: number | null;
      notes: string | null;
      travelStartDate: Date | null;
      travelEndDate: Date | null;
      version: number;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.tripFile.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Trip file', id);
    assertVersion('trip file', input.version, before.version);

    const { version: _version, ...data } = input;
    // Setting the window by hand stops it being recomputed from services.
    const datesTouched = 'travelStartDate' in input || 'travelEndDate' in input;

    const after = await this.prisma.tripFile.update({
      where: { id },
      data: {
        ...data,
        ...(datesTouched ? { travelDatesOverridden: true } : {}),
        updatedById: ctx.actorId ?? null,
        version: { increment: 1 },
      },
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    if (diff.changedFields.length) {
      await this.audit.record({
        action: 'TRIP_UPDATED', entityType: 'TripFile', entityId: id,
        actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
        before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
      });
    }
    return after;
  }

  /** Moves the trip through its workflow, enforcing the state machine. */
  async changeStatus(
    id: string,
    to: TripStatus,
    reason: string | undefined,
    ctx: ActorContext,
  ): Promise<unknown> {
    const trip = await this.prisma.tripFile.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, version: true },
    });
    if (!trip) throw new NotFoundError('Trip file', id);

    const from = trip.status as TripStatus;
    if (!canTransition(TRIP_TRANSITIONS, from, to)) {
      throw new InvalidStatusTransitionError(
        'trip file', from, to, allowedTransitions(TRIP_TRANSITIONS, from),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tripFile.update({
        where: { id },
        data: { status: to, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
      });
      await tx.statusTransition.create({
        data: {
          entityType: 'TripFile', entityId: id, fromStatus: from, toStatus: to,
          reason: reason ?? null, actorId: ctx.actorId ?? null, tripFileId: id,
        },
      });
      return result;
    });

    await this.audit.record({
      action: 'TRIP_STATUS_CHANGED', entityType: 'TripFile', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { status: from }, after: { status: to }, metadata: { reason },
    });
    return updated;
  }

  /** Trip files are archived rather than deleted; the history stays intact. */
  async archive(id: string, ctx: ActorContext): Promise<void> {
    const trip = await this.prisma.tripFile.findFirst({ where: { id, deletedAt: null } });
    if (!trip) throw new NotFoundError('Trip file', id);

    await this.prisma.tripFile.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: ctx.actorId ?? null },
    });
    await this.audit.record({
      action: 'TRIP_ARCHIVED', entityType: 'TripFile', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, before: trip,
    });
  }

  allowedNextStatuses(current: TripStatus): readonly TripStatus[] {
    return allowedTransitions(TRIP_TRANSITIONS, current);
  }
}
