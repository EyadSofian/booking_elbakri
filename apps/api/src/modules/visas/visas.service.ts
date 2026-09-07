import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  allowedTransitions, buildPaginationMeta, calculateMargin, calculateMarginPercent,
  canTransition, normalizeForSearch, PERMISSIONS, REFERENCE_PREFIXES,
  VISA_TRANSITIONS, VisaStatus,
  type PaginatedResponse, type VisaStatus as OrderStatus,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AuditService } from '../audit/audit.service';
import { assertVersion } from '../../common/services/concurrency';
import { buildOrderBy, toSkipTake } from '../../common/services/pagination';
import { InvalidStatusTransitionError, NotFoundError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

const SORTABLE = ['reference', 'serviceDate', 'status', 'createdAt', 'paxCount'] as const;

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value.toString());
}

@Injectable()
export class VisasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Attaches the derived commercial figures.
   *
   * Margin is computed from net and sell on every read and is never a stored,
   * editable column — a stored margin can silently disagree with the amounts it
   * came from. Financial fields are stripped entirely for users without the
   * visa finance permission.
   */
  private present(
    order: {
      netAmount: Prisma.Decimal | null;
      sellAmount: Prisma.Decimal | null;
      [key: string]: unknown;
    },
    canSeeFinance: boolean,
  ): Record<string, unknown> {
    const net = num(order.netAmount);
    const sell = num(order.sellAmount);

    if (!canSeeFinance) {
      const { netAmount: _net, sellAmount: _sell, ...rest } = order;
      return rest;
    }
    return {
      ...order,
      netAmount: net,
      sellAmount: sell,
      margin: calculateMargin(sell, net),
      marginPercent: calculateMarginPercent(sell, net),
    };
  }

  private canSeeFinance(permissions: string[]): boolean {
    return permissions.includes(PERMISSIONS.VISAS_FINANCE_READ) || permissions.includes(PERMISSIONS.FINANCE_READ);
  }

  async list(
    query: {
      page: number; pageSize: number; sortBy?: string; sortDir: 'asc' | 'desc';
      q?: string; status?: string[]; partnerId?: string;
      dateFrom?: Date; dateTo?: Date; destination?: string;
    },
    permissions: string[],
  ): Promise<PaginatedResponse<unknown>> {
    const and: Prisma.VisaOrderWhereInput[] = [{ deletedAt: null }];

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.partnerId) and.push({ partnerId: query.partnerId });
    if (query.destination) and.push({ destinationRaw: { contains: query.destination, mode: 'insensitive' } });
    if (query.dateFrom) and.push({ serviceDate: { gte: query.dateFrom } });
    if (query.dateTo) and.push({ serviceDate: { lte: query.dateTo } });
    if (query.q) {
      const norm = normalizeForSearch(query.q);
      and.push({
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { leadTraveler: { normalizedName: { contains: norm } } },
          { originRaw: { contains: query.q, mode: 'insensitive' } },
          { destinationRaw: { contains: query.q, mode: 'insensitive' } },
          { tripFile: { reference: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.VisaOrderWhereInput = { AND: and };
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.visaOrder.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortDir, SORTABLE, { serviceDate: 'desc' }),
        include: {
          leadTraveler: {
            select: {
              id: true, fullName: true, phoneRaw: true, nationalityRaw: true,
              nationality: { select: { id: true, code: true, name: true, nameAr: true } },
            },
          },
          partner: { select: { id: true, name: true, nameAr: true } },
          tripFile: { select: { id: true, reference: true } },
          _count: { select: { applicants: true } },
        },
      }),
      this.prisma.visaOrder.count({ where }),
    ]);

    const canSeeFinance = this.canSeeFinance(permissions);
    return {
      data: rows.map((r) => this.present(r, canSeeFinance)),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async findOne(id: string, permissions: string[]): Promise<unknown> {
    const order = await this.prisma.visaOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        leadTraveler: { include: { nationality: true } },
        partner: true,
        tripFile: { select: { id: true, reference: true, status: true } },
        applicants: { include: { traveler: { select: { id: true, fullName: true } } } },
        attachments: { where: { deletedAt: null } },
        importRun: { select: { id: true, sourceFilename: true } },
      },
    });
    if (!order) throw new NotFoundError('Visa order', id);
    return this.present(order, this.canSeeFinance(permissions));
  }

  async create(
    input: {
      tripFileId: string;
      leadTravelerId?: string | null;
      partnerId?: string | null;
      originRaw?: string | null;
      destinationRaw?: string | null;
      paxCount?: number | null;
      serviceDate?: Date | null;
      netAmount?: number | null;
      sellAmount?: number | null;
      currency?: string;
      notes?: string | null;
      applicants?: Array<{ travelerId?: string | null; fullName?: string | null; passportNumber?: string | null }>;
    },
    ctx: ActorContext,
    permissions: string[],
  ): Promise<unknown> {
    const trip = await this.prisma.tripFile.findFirst({
      where: { id: input.tripFileId, deletedAt: null },
      select: { id: true, leadTravelerId: true, partnerId: true },
    });
    if (!trip) throw new NotFoundError('Trip file', input.tripFileId);

    const order = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.next(REFERENCE_PREFIXES.VISA, tx);
      const created = await tx.visaOrder.create({
        data: {
          reference,
          tripFileId: input.tripFileId,
          leadTravelerId: input.leadTravelerId ?? trip.leadTravelerId,
          partnerId: input.partnerId ?? trip.partnerId,
          originRaw: input.originRaw ?? null,
          destinationRaw: input.destinationRaw ?? null,
          paxCount: input.paxCount ?? null,
          serviceDate: input.serviceDate ?? null,
          netAmount: input.netAmount ?? null,
          sellAmount: input.sellAmount ?? null,
          currency: input.currency ?? 'USD',
          status: VisaStatus.DRAFT,
          notes: input.notes ?? null,
          createdById: ctx.actorId ?? null,
        },
      });

      for (const applicant of input.applicants ?? []) {
        await tx.visaApplicant.create({
          data: {
            visaOrderId: created.id,
            travelerId: applicant.travelerId ?? null,
            fullName: applicant.fullName ?? null,
            passportNumber: applicant.passportNumber ?? null,
          },
        });
      }
      return created;
    });

    await this.audit.record({
      action: 'VISA_ORDER_CREATED', entityType: 'VisaOrder', entityId: order.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: order,
    });
    return this.present(order, this.canSeeFinance(permissions));
  }

  async update(
    id: string,
    input: Partial<{
      leadTravelerId: string | null; partnerId: string | null;
      originRaw: string | null; destinationRaw: string | null;
      paxCount: number | null; serviceDate: Date | null;
      netAmount: number | null; sellAmount: number | null;
      currency: string; notes: string | null; version: number;
    }>,
    ctx: ActorContext,
    permissions: string[],
  ): Promise<unknown> {
    const before = await this.prisma.visaOrder.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Visa order', id);
    assertVersion('visa order', input.version, before.version);

    // Amounts can only be changed by someone allowed to see visa finance.
    const canSeeFinance = this.canSeeFinance(permissions);
    const { version: _version, ...rest } = input;
    const data = canSeeFinance
      ? rest
      : (({ netAmount: _n, sellAmount: _s, ...safe }) => safe)(rest);

    const after = await this.prisma.visaOrder.update({
      where: { id },
      data: { ...data, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'VISA_ORDER_UPDATED', entityType: 'VisaOrder', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return this.present(after, canSeeFinance);
  }

  async changeStatus(
    id: string,
    to: OrderStatus,
    reason: string | undefined,
    ctx: ActorContext,
  ): Promise<unknown> {
    const order = await this.prisma.visaOrder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, tripFileId: true },
    });
    if (!order) throw new NotFoundError('Visa order', id);

    const from = order.status as OrderStatus;
    if (!canTransition(VISA_TRANSITIONS, from, to)) {
      throw new InvalidStatusTransitionError(
        'visa order', from, to, allowedTransitions(VISA_TRANSITIONS, from),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visaOrder.update({
        where: { id },
        data: { status: to, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
      });
      await tx.statusTransition.create({
        data: {
          entityType: 'VisaOrder', entityId: id, fromStatus: from, toStatus: to,
          reason: reason ?? null, actorId: ctx.actorId ?? null, tripFileId: order.tripFileId,
        },
      });
      return row;
    });

    await this.audit.record({
      action: 'VISA_STATUS_CHANGED', entityType: 'VisaOrder', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { status: from }, after: { status: to }, metadata: { reason },
    });
    return updated;
  }

  /**
   * Adds an applicant to an order.
   *
   * Legacy rows recorded only an aggregate PAX count, so orders can exist with
   * no applicant rows; adding detail later must not invalidate them.
   */
  async addApplicant(
    orderId: string,
    input: { travelerId?: string | null; fullName?: string | null; passportNumber?: string | null; passportExpiry?: Date | null },
    ctx: ActorContext,
  ): Promise<unknown> {
    const order = await this.prisma.visaOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new NotFoundError('Visa order', orderId);

    const applicant = await this.prisma.visaApplicant.create({
      data: {
        visaOrderId: orderId,
        travelerId: input.travelerId ?? null,
        fullName: input.fullName ?? null,
        passportNumber: input.passportNumber ?? null,
        passportExpiry: input.passportExpiry ?? null,
      },
    });

    await this.audit.record({
      action: 'VISA_APPLICANT_ADDED', entityType: 'VisaApplicant', entityId: applicant.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      metadata: { visaOrderId: orderId },
    });
    return applicant;
  }

  async updateApplicant(
    applicantId: string,
    input: Partial<{
      fullName: string | null; passportNumber: string | null;
      passportExpiry: Date | null; status: string; documentsComplete: boolean; notes: string | null;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.visaApplicant.findUnique({ where: { id: applicantId } });
    if (!before) throw new NotFoundError('Visa applicant', applicantId);

    const after = await this.prisma.visaApplicant.update({ where: { id: applicantId }, data: input });
    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'VISA_APPLICANT_UPDATED', entityType: 'VisaApplicant', entityId: applicantId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after,
    });
    return after;
  }

  allowedNextStatuses(current: OrderStatus): readonly OrderStatus[] {
    return allowedTransitions(VISA_TRANSITIONS, current);
  }
}
