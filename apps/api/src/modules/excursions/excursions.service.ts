import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  allowedTransitions, buildPaginationMeta, canTransition, EXCURSION_TRANSITIONS,
  ExcursionStatus, normalizeForSearch, REFERENCE_PREFIXES,
  type PaginatedResponse, type ExcursionStatus as ItemStatus,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AuditService } from '../audit/audit.service';
import { assertVersion } from '../../common/services/concurrency';
import { buildOrderBy, toSkipTake } from '../../common/services/pagination';
import { InvalidStatusTransitionError, NotFoundError, ValidationError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

export interface ExcursionItemInput {
  catalogItemId?: string | null;
  activityRaw?: string | null;
  serviceDate?: Date | null;
  serviceTimeMinutes?: number | null;
  paxOverride?: number | null;
  childOverride?: number | null;
  transferRequired?: boolean;
  guideRequired?: boolean;
  addOns?: string | null;
  supplierPartnerId?: string | null;
  notes?: string | null;
}

const SORTABLE = ['reference', 'status', 'createdAt', 'updatedAt'] as const;

const BOOKING_INCLUDE = {
  hotel: { select: { id: true, name: true, nameAr: true } },
  partner: { select: { id: true, name: true, nameAr: true } },
  leadTraveler: {
    select: {
      id: true, fullName: true, phoneRaw: true, phoneNormalized: true, nationalityRaw: true,
      nationality: { select: { id: true, code: true, name: true, nameAr: true } },
    },
  },
  tripFile: { select: { id: true, reference: true, status: true } },
  items: {
    orderBy: [{ serviceDate: 'asc' as const }, { sequence: 'asc' as const }],
    include: { catalogItem: { select: { id: true, code: true, name: true, nameAr: true, category: true } } },
  },
} satisfies Prisma.ExcursionBookingInclude;

@Injectable()
export class ExcursionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  async listBookings(query: {
    page: number; pageSize: number; sortBy?: string; sortDir: 'asc' | 'desc';
    q?: string; status?: string[]; hotelId?: string; partnerId?: string;
    dateFrom?: Date; dateTo?: Date;
  }): Promise<PaginatedResponse<unknown>> {
    const and: Prisma.ExcursionBookingWhereInput[] = [{ deletedAt: null }];

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.hotelId) and.push({ hotelId: query.hotelId });
    if (query.partnerId) and.push({ partnerId: query.partnerId });
    if (query.dateFrom || query.dateTo) {
      and.push({
        items: {
          some: {
            serviceDate: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
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
          { leadTraveler: { normalizedName: { contains: norm } } },
          { hotel: { normalizedName: { contains: norm } } },
          { hotelRaw: { contains: query.q, mode: 'insensitive' } },
          { items: { some: { activityRaw: { contains: query.q, mode: 'insensitive' } } } },
          { items: { some: { catalogItem: { normalizedName: { contains: norm } } } } },
        ],
      });
    }

    const where: Prisma.ExcursionBookingWhereInput = { AND: and };
    const { skip, take } = toSkipTake(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.excursionBooking.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortDir, SORTABLE, { createdAt: 'desc' }),
        include: BOOKING_INCLUDE,
      }),
      this.prisma.excursionBooking.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async findBooking(id: string): Promise<unknown> {
    const booking = await this.prisma.excursionBooking.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...BOOKING_INCLUDE,
        attachments: { where: { deletedAt: null } },
        importRun: { select: { id: true, sourceFilename: true } },
      },
    });
    if (!booking) throw new NotFoundError('Excursion booking', id);
    return booking;
  }

  /**
   * One order, many activities.
   *
   * A customer who books a safari, parasailing and a boat trip is one order
   * with three items — not three customers, which is how the legacy sheet's
   * blank-name rows would otherwise be read.
   */
  async createBooking(
    input: {
      tripFileId: string;
      leadTravelerId?: string | null;
      partnerId?: string | null;
      hotelId?: string | null;
      hotelRaw?: string | null;
      paxCount?: number | null;
      childCount?: number | null;
      notes?: string | null;
      items: ExcursionItemInput[];
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    const trip = await this.prisma.tripFile.findFirst({
      where: { id: input.tripFileId, deletedAt: null },
      select: { id: true, leadTravelerId: true, partnerId: true },
    });
    if (!trip) throw new NotFoundError('Trip file', input.tripFileId);
    if (!input.items?.length) {
      throw new ValidationError('An excursion order needs at least one activity.');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.next(REFERENCE_PREFIXES.EXCURSION, tx);
      const created = await tx.excursionBooking.create({
        data: {
          reference,
          tripFileId: input.tripFileId,
          leadTravelerId: input.leadTravelerId ?? trip.leadTravelerId,
          partnerId: input.partnerId ?? trip.partnerId,
          hotelId: input.hotelId ?? null,
          hotelRaw: input.hotelRaw ?? null,
          paxCount: input.paxCount ?? null,
          childCount: input.childCount ?? null,
          notes: input.notes ?? null,
          status: ExcursionStatus.DRAFT,
          createdById: ctx.actorId ?? null,
        },
      });

      let sequence = 1;
      for (const item of input.items) {
        await tx.excursionItem.create({ data: this.itemData(created.id, item, sequence) });
        sequence++;
      }
      await this.refreshTripDates(tx, input.tripFileId);
      return created;
    });

    await this.audit.record({
      action: 'EXCURSION_BOOKING_CREATED', entityType: 'ExcursionBooking', entityId: booking.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: booking,
    });
    return this.findBooking(booking.id);
  }

  private itemData(
    excursionBookingId: string,
    item: ExcursionItemInput,
    sequence: number,
  ): Prisma.ExcursionItemUncheckedCreateInput {
    if (!item.catalogItemId && !item.activityRaw?.trim()) {
      throw new ValidationError('Each activity needs either a catalogue item or a description.');
    }
    return {
      excursionBookingId,
      catalogItemId: item.catalogItemId ?? null,
      activityRaw: item.activityRaw ?? null,
      sequence,
      serviceDate: item.serviceDate ?? null,
      serviceTimeMinutes: item.serviceTimeMinutes ?? null,
      paxOverride: item.paxOverride ?? null,
      childOverride: item.childOverride ?? null,
      transferRequired: item.transferRequired ?? false,
      guideRequired: item.guideRequired ?? false,
      addOns: item.addOns ?? null,
      supplierPartnerId: item.supplierPartnerId ?? null,
      notes: item.notes ?? null,
      status: ExcursionStatus.DRAFT,
    };
  }

  async addItem(bookingId: string, item: ExcursionItemInput, ctx: ActorContext): Promise<unknown> {
    const booking = await this.prisma.excursionBooking.findFirst({
      where: { id: bookingId, deletedAt: null },
      select: { id: true, tripFileId: true, _count: { select: { items: true } } },
    });
    if (!booking) throw new NotFoundError('Excursion booking', bookingId);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.excursionItem.create({
        data: this.itemData(bookingId, item, booking._count.items + 1),
      });
      await this.refreshTripDates(tx, booking.tripFileId);
      return row;
    });

    await this.audit.record({
      action: 'EXCURSION_ITEM_ADDED', entityType: 'ExcursionItem', entityId: created.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: created, metadata: { excursionBookingId: bookingId },
    });
    return created;
  }

  async updateItem(itemId: string, input: Partial<ExcursionItemInput & { version: number }>, ctx: ActorContext): Promise<unknown> {
    const before = await this.prisma.excursionItem.findUnique({
      where: { id: itemId },
      include: { excursionBooking: { select: { tripFileId: true } } },
    });
    if (!before) throw new NotFoundError('Excursion item', itemId);
    assertVersion('excursion item', input.version, before.version);

    const { version: _version, ...data } = input;
    const after = await this.prisma.$transaction(async (tx) => {
      const row = await tx.excursionItem.update({
        where: { id: itemId },
        data: { ...data, version: { increment: 1 } },
      });
      await this.refreshTripDates(tx, before.excursionBooking.tripFileId);
      return row;
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'EXCURSION_ITEM_UPDATED', entityType: 'ExcursionItem', entityId: itemId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  async updateBooking(
    id: string,
    input: Partial<{
      leadTravelerId: string | null; partnerId: string | null;
      hotelId: string | null; hotelRaw: string | null;
      paxCount: number | null; childCount: number | null;
      notes: string | null; version: number;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.excursionBooking.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Excursion booking', id);
    assertVersion('excursion booking', input.version, before.version);

    const { version: _version, ...data } = input;
    const after = await this.prisma.excursionBooking.update({
      where: { id },
      data: { ...data, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'EXCURSION_BOOKING_UPDATED', entityType: 'ExcursionBooking', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  async changeItemStatus(
    itemId: string,
    to: ItemStatus,
    reason: string | undefined,
    ctx: ActorContext,
  ): Promise<unknown> {
    const item = await this.prisma.excursionItem.findUnique({
      where: { id: itemId },
      include: { excursionBooking: { select: { tripFileId: true } } },
    });
    if (!item) throw new NotFoundError('Excursion item', itemId);

    const from = item.status as ItemStatus;
    if (!canTransition(EXCURSION_TRANSITIONS, from, to)) {
      throw new InvalidStatusTransitionError(
        'excursion item', from, to, allowedTransitions(EXCURSION_TRANSITIONS, from),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.excursionItem.update({
        where: { id: itemId },
        data: { status: to, version: { increment: 1 } },
      });
      await tx.statusTransition.create({
        data: {
          entityType: 'ExcursionItem', entityId: itemId, fromStatus: from, toStatus: to,
          reason: reason ?? null, actorId: ctx.actorId ?? null,
          tripFileId: item.excursionBooking.tripFileId,
        },
      });
      return row;
    });

    await this.audit.record({
      action: 'EXCURSION_ITEM_STATUS_CHANGED', entityType: 'ExcursionItem', entityId: itemId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { status: from }, after: { status: to }, metadata: { reason },
    });
    return updated;
  }

  /** Day sheet for the excursion desk: every activity running on one date. */
  async dailyBoard(date: Date, hotelId?: string): Promise<unknown> {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);

    return this.prisma.excursionItem.findMany({
      where: {
        serviceDate: { gte: start, lt: end },
        excursionBooking: { deletedAt: null, ...(hotelId ? { hotelId } : {}) },
      },
      orderBy: [{ serviceTimeMinutes: 'asc' }, { sequence: 'asc' }],
      include: {
        catalogItem: { select: { id: true, name: true, nameAr: true, category: true } },
        excursionBooking: {
          select: {
            id: true, reference: true, paxCount: true, childCount: true, hotelRaw: true, notes: true,
            hotel: { select: { id: true, name: true, nameAr: true } },
            partner: { select: { id: true, name: true } },
            leadTraveler: { select: { id: true, fullName: true, phoneRaw: true } },
            tripFile: { select: { id: true, reference: true } },
          },
        },
      },
    });
  }

  private async refreshTripDates(tx: Prisma.TransactionClient, tripFileId: string): Promise<void> {
    const items = await tx.excursionItem.findMany({
      where: { excursionBooking: { tripFileId, deletedAt: null } },
      select: { serviceDate: true },
    });
    const dates = items.map((i) => i.serviceDate).filter((d): d is Date => Boolean(d));
    if (!dates.length) return;
    const trip = await tx.tripFile.findUnique({
      where: { id: tripFileId },
      select: { travelStartDate: true, travelEndDate: true, travelDatesOverridden: true },
    });
    if (!trip || trip.travelDatesOverridden) return;

    // Widen the window rather than replacing it — other services also count.
    const times = dates.map((d) => d.getTime());
    const min = Math.min(...times, trip.travelStartDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
    const max = Math.max(...times, trip.travelEndDate?.getTime() ?? 0);
    await tx.tripFile.update({
      where: { id: tripFileId },
      data: { travelStartDate: new Date(min), travelEndDate: new Date(max) },
    });
  }

  allowedNextStatuses(current: ItemStatus): readonly ItemStatus[] {
    return allowedTransitions(EXCURSION_TRANSITIONS, current);
  }
}
