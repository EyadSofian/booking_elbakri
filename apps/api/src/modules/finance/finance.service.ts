import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildPaginationMeta, calculateOutstanding, calculatePaid, deriveDocumentStatus,
  ERROR_CODES, FinancialDocumentStatus, normalizeForSearch, PaymentStatus,
  REFERENCE_PREFIXES, reconcileLegacyPayment, roundMoney,
  type PaginatedResponse,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { ReferenceService } from '../../common/services/reference.service';
import { AuditService } from '../audit/audit.service';
import { assertVersion } from '../../common/services/concurrency';
import { buildOrderBy, toSkipTake } from '../../common/services/pagination';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

export interface PayableListQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  q?: string;
  status?: string[];
  counterpartyId?: string;
  tripFileId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  onlyOutstanding?: boolean;
  onlyOverdue?: boolean;
}

const SORTABLE = ['reference', 'totalAmount', 'dueDate', 'serviceDate', 'status', 'createdAt'] as const;

/** Prisma returns Decimal; every calculation here works in plain numbers. */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Payables and receivables
  // -------------------------------------------------------------------------

  async listDocuments(query: PayableListQuery): Promise<PaginatedResponse<unknown>> {
    const where = this.buildDocumentWhere(query);
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.financialDocument.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortDir, SORTABLE, { dueDate: 'asc' }),
        include: {
          counterparty: { select: { id: true, name: true, type: true } },
          tripFile: { select: { id: true, reference: true } },
          hotelBooking: { select: { id: true, reference: true } },
          payments: { select: { amount: true, status: true } },
        },
      }),
      this.prisma.financialDocument.count({ where }),
    ]);

    // Paid and outstanding are derived from the ledger on every read. They are
    // never stored, so a stale column can never disagree with the transactions.
    const data = rows.map((doc) => this.withDerivedTotals(doc));
    const filtered = query.onlyOutstanding ? data.filter((d) => d.outstanding > 0.009) : data;

    return { data: filtered, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  private withDerivedTotals<
    T extends { totalAmount: Prisma.Decimal; payments: Array<{ amount: Prisma.Decimal; status: string }> },
  >(doc: T) {
    const payments = doc.payments.map((p) => ({
      amount: num(p.amount),
      status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
    }));
    const totalAmount = num(doc.totalAmount);
    return {
      ...doc,
      totalAmount,
      paidAmount: calculatePaid(payments),
      outstanding: calculateOutstanding(totalAmount, payments),
    };
  }

  private buildDocumentWhere(query: PayableListQuery): Prisma.FinancialDocumentWhereInput {
    const and: Prisma.FinancialDocumentWhereInput[] = [{ deletedAt: null }];

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.counterpartyId) and.push({ counterpartyId: query.counterpartyId });
    if (query.tripFileId) and.push({ tripFileId: query.tripFileId });
    if (query.dueFrom) and.push({ dueDate: { gte: query.dueFrom } });
    if (query.dueTo) and.push({ dueDate: { lte: query.dueTo } });
    if (query.onlyOverdue) {
      and.push({
        dueDate: { lt: new Date() },
        status: { in: [FinancialDocumentStatus.OPEN, FinancialDocumentStatus.PARTIALLY_PAID] },
      });
    }
    if (query.q) {
      const norm = normalizeForSearch(query.q);
      and.push({
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { serviceDescription: { contains: query.q, mode: 'insensitive' } },
          { counterparty: { normalizedName: { contains: norm } } },
          { tripFile: { reference: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    return { AND: and };
  }

  async findDocument(id: string): Promise<unknown> {
    const doc = await this.prisma.financialDocument.findFirst({
      where: { id, deletedAt: null },
      include: {
        counterparty: true,
        tripFile: { select: { id: true, reference: true, leadTraveler: { select: { fullName: true } } } },
        hotelBooking: { select: { id: true, reference: true, hotelRaw: true, hotel: { select: { name: true } } } },
        payments: {
          orderBy: { paymentDate: 'asc' },
          include: { reverses: { select: { id: true, reference: true } } },
        },
        attachments: { where: { deletedAt: null } },
        importRun: { select: { id: true, sourceFilename: true } },
      },
    });
    if (!doc) throw new NotFoundError('Financial document', id);

    const derived = this.withDerivedTotals(doc);

    // For an imported row, show the legacy figures beside the ledger balance so
    // a finance user can see exactly where the spreadsheet disagreed.
    const legacy = doc.legacyRestRaw || doc.legacyTotalRaw || doc.legacyPaidRaw
      ? reconcileLegacyPayment({
          legacyTotal: this.parseLegacyNumber(doc.legacyTotalRaw),
          legacyPaid: this.parseLegacyNumber(doc.legacyPaidRaw),
          legacyRest: this.parseLegacyNumber(doc.legacyRestRaw),
          totalAmount: derived.totalAmount,
          payments: doc.payments.map((p) => ({
            amount: num(p.amount),
            status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
          })),
        })
      : null;

    return {
      ...derived,
      payments: doc.payments.map((p) => ({ ...p, amount: num(p.amount) })),
      legacyReconciliation: legacy
        ? {
            ...legacy,
            legacyTotalRaw: doc.legacyTotalRaw,
            legacyPaidRaw: doc.legacyPaidRaw,
            legacyRestRaw: doc.legacyRestRaw,
            legacyStatusRaw: doc.legacyStatusRaw,
            legacyPaymentDateRaw: doc.legacyPaymentDateRaw,
          }
        : null,
    };
  }

  /**
   * Reads a stored legacy figure back as a number.
   *
   * These columns hold whatever the spreadsheet contained, including text such
   * as "credit" or "-". Anything that is not purely numeric returns null rather
   * than a partially-parsed figure.
   */
  private parseLegacyNumber(raw: string | null): number | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
    return Number(trimmed);
  }

  async createDocument(
    input: {
      type?: string;
      counterpartyId?: string | null;
      tripFileId?: string | null;
      hotelBookingId?: string | null;
      serviceDescription?: string | null;
      totalAmount: number;
      currency?: string;
      issueDate?: Date | null;
      dueDate?: Date | null;
      serviceDate?: Date | null;
      notes?: string | null;
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    if (input.totalAmount < 0) {
      throw new ValidationError('A document total cannot be negative. Use a credit note instead.');
    }

    const doc = await this.prisma.$transaction(async (tx) => {
      const prefix = input.type === 'RECEIVABLE' ? REFERENCE_PREFIXES.RECEIVABLE : REFERENCE_PREFIXES.PAYABLE;
      const reference = await this.references.next(prefix, tx);
      return tx.financialDocument.create({
        data: {
          reference,
          type: input.type ?? 'PAYABLE',
          counterpartyId: input.counterpartyId ?? null,
          tripFileId: input.tripFileId ?? null,
          hotelBookingId: input.hotelBookingId ?? null,
          serviceDescription: input.serviceDescription ?? null,
          totalAmount: input.totalAmount,
          currency: input.currency ?? 'EGP',
          issueDate: input.issueDate ?? new Date(),
          dueDate: input.dueDate ?? null,
          serviceDate: input.serviceDate ?? null,
          status: FinancialDocumentStatus.OPEN,
          notes: input.notes ?? null,
          createdById: ctx.actorId ?? null,
        },
      });
    });

    await this.audit.record({
      action: 'FINANCIAL_DOCUMENT_CREATED', entityType: 'FinancialDocument', entityId: doc.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId, after: doc,
    });
    return doc;
  }

  async updateDocument(
    id: string,
    input: Partial<{
      counterpartyId: string | null;
      serviceDescription: string | null;
      totalAmount: number;
      dueDate: Date | null;
      serviceDate: Date | null;
      notes: string | null;
      version: number;
    }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.financialDocument.findFirst({
      where: { id, deletedAt: null },
      include: { payments: { select: { amount: true, status: true } } },
    });
    if (!before) throw new NotFoundError('Financial document', id);
    assertVersion('financial document', input.version, before.version);

    const { version: _version, ...data } = input;

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialDocument.update({
        where: { id },
        data: { ...data, updatedById: ctx.actorId ?? null, version: { increment: 1 } },
      });
      // Changing the total changes the balance, so the status is re-derived.
      const payments = before.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const status = deriveDocumentStatus(num(updated.totalAmount), payments);
      return tx.financialDocument.update({ where: { id }, data: { status } });
    });

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'FINANCIAL_DOCUMENT_UPDATED', entityType: 'FinancialDocument', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return after;
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  /**
   * Records a payment against a document.
   *
   * Users record money movements; they never type a "paid" or "rest" total.
   * The document's paid amount and status are recomputed from the ledger inside
   * the same transaction.
   */
  async recordPayment(
    documentId: string,
    input: {
      amount: number;
      paymentDate: Date;
      method?: string;
      paymentReference?: string | null;
      currency?: string;
      notes?: string | null;
      allowOverpayment?: boolean;
    },
    ctx: ActorContext,
  ): Promise<unknown> {
    if (input.amount <= 0) {
      throw new ValidationError('A payment amount must be greater than zero. To undo a payment, reverse it.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.financialDocument.findFirst({
        where: { id: documentId, deletedAt: null },
        include: { payments: { select: { amount: true, status: true } } },
      });
      if (!doc) throw new NotFoundError('Financial document', documentId);
      if (doc.status === FinancialDocumentStatus.CANCELLED) {
        throw new ConflictError('This document has been cancelled and cannot take payments.');
      }

      const existing = doc.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const outstanding = calculateOutstanding(num(doc.totalAmount), existing);

      if (!input.allowOverpayment && roundMoney(input.amount) > outstanding + 0.01) {
        throw new DomainError(
          ERROR_CODES.PAYMENT_EXCEEDS_DOCUMENT,
          `This payment of ${input.amount} exceeds the outstanding balance of ${outstanding}.`,
          409,
          { outstanding, attempted: input.amount },
        );
      }

      const reference = await this.references.next(REFERENCE_PREFIXES.PAYMENT, tx);
      const payment = await tx.paymentTransaction.create({
        data: {
          reference,
          financialDocumentId: documentId,
          counterpartyId: doc.counterpartyId,
          amount: input.amount,
          currency: input.currency ?? doc.currency,
          paymentDate: input.paymentDate,
          method: input.method ?? 'UNKNOWN',
          paymentReference: input.paymentReference ?? null,
          status: PaymentStatus.POSTED,
          notes: input.notes ?? null,
          createdById: ctx.actorId ?? null,
        },
      });

      const status = deriveDocumentStatus(
        num(doc.totalAmount),
        [...existing, { amount: input.amount, status: PaymentStatus.POSTED }],
      );
      await tx.financialDocument.update({ where: { id: documentId }, data: { status } });

      return payment;
    });

    await this.audit.record({
      action: 'PAYMENT_RECORDED', entityType: 'PaymentTransaction', entityId: result.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { ...result, amount: num(result.amount) },
      metadata: { financialDocumentId: documentId },
    });
    return { ...result, amount: num(result.amount) };
  }

  /**
   * Reverses a payment.
   *
   * The original row is never edited or deleted: it is marked REVERSED and a
   * matching negative REVERSAL entry is written, so the history shows both the
   * mistake and the correction.
   */
  async reversePayment(paymentId: string, reason: string, ctx: ActorContext): Promise<unknown> {
    if (!reason?.trim()) {
      throw new ValidationError('A reason is required when reversing a payment.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const original = await tx.paymentTransaction.findUnique({
        where: { id: paymentId },
        include: { financialDocument: { include: { payments: { select: { amount: true, status: true } } } } },
      });
      if (!original) throw new NotFoundError('Payment', paymentId);
      if (original.status !== PaymentStatus.POSTED) {
        throw new DomainError(
          ERROR_CODES.PAYMENT_ALREADY_REVERSED,
          'Only a posted payment can be reversed.',
          409,
          { status: original.status },
        );
      }

      const now = new Date();
      await tx.paymentTransaction.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.REVERSED,
          reversedAt: now,
          reversedById: ctx.actorId ?? null,
          reversalReason: reason,
        },
      });

      const reference = await this.references.next(REFERENCE_PREFIXES.PAYMENT, tx);
      const reversal = await tx.paymentTransaction.create({
        data: {
          reference,
          financialDocumentId: original.financialDocumentId,
          counterpartyId: original.counterpartyId,
          settlementId: original.settlementId,
          amount: num(original.amount) * -1,
          currency: original.currency,
          paymentDate: now,
          method: original.method,
          status: PaymentStatus.REVERSAL,
          reversesPaymentId: paymentId,
          reversalReason: reason,
          notes: `Reversal of ${original.reference}`,
          createdById: ctx.actorId ?? null,
        },
      });

      if (original.financialDocument && original.financialDocumentId) {
        // Re-read what is still posted after this reversal rather than
        // adjusting a cached figure, so the status always matches the ledger.
        const posted = await tx.paymentTransaction.findMany({
          where: { financialDocumentId: original.financialDocumentId, status: PaymentStatus.POSTED },
          select: { amount: true },
        });
        const status = deriveDocumentStatus(
          num(original.financialDocument.totalAmount),
          posted.map((p) => ({ amount: num(p.amount), status: PaymentStatus.POSTED })),
        );
        await tx.financialDocument.update({
          where: { id: original.financialDocumentId },
          data: { status },
        });
      }

      return reversal;
    });

    await this.audit.record({
      action: 'PAYMENT_REVERSED', entityType: 'PaymentTransaction', entityId: paymentId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { reversalId: result.id, reason },
      metadata: { reason },
    });
    return { ...result, amount: num(result.amount) };
  }

  async listPayments(query: {
    page: number; pageSize: number; counterpartyId?: string;
    documentId?: string; dateFrom?: Date; dateTo?: Date; status?: string;
  }): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(query.counterpartyId ? { counterpartyId: query.counterpartyId } : {}),
      ...(query.documentId ? { financialDocumentId: query.documentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? { paymentDate: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { paymentDate: 'desc' },
        include: {
          counterparty: { select: { id: true, name: true } },
          financialDocument: { select: { id: true, reference: true, serviceDescription: true } },
        },
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);

    return {
      data: rows.map((p) => ({ ...p, amount: num(p.amount) })),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  // -------------------------------------------------------------------------
  // Overview and reconciliation
  // -------------------------------------------------------------------------

  async overview(): Promise<unknown> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [documents, monthPayments, counterpartyBalances] = await Promise.all([
      this.prisma.financialDocument.findMany({
        where: { deletedAt: null, status: { not: FinancialDocumentStatus.CANCELLED } },
        select: {
          id: true, totalAmount: true, currency: true, dueDate: true, status: true,
          payments: { select: { amount: true, status: true } },
        },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: { status: PaymentStatus.POSTED, paymentDate: { gte: monthStart } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.financialDocument.groupBy({
        by: ['counterpartyId'],
        where: { deletedAt: null, status: { in: [FinancialDocumentStatus.OPEN, FinancialDocumentStatus.PARTIALLY_PAID] } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    let totalPayable = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueOutstanding = 0;
    let overdueCount = 0;

    for (const doc of documents) {
      const payments = doc.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const total = num(doc.totalAmount);
      const paid = calculatePaid(payments);
      const outstanding = roundMoney(total - paid);

      totalPayable += total;
      totalPaid += paid;
      totalOutstanding += outstanding;
      if (outstanding > 0.009 && doc.dueDate && doc.dueDate < now) {
        overdueOutstanding += outstanding;
        overdueCount++;
      }
    }

    const counterpartyIds = counterpartyBalances.map((b) => b.counterpartyId).filter((id): id is string => Boolean(id));
    const counterparties = counterpartyIds.length
      ? await this.prisma.counterparty.findMany({
          where: { id: { in: counterpartyIds } },
          select: { id: true, name: true, type: true },
        })
      : [];
    const nameById = new Map(counterparties.map((c) => [c.id, c]));

    return {
      totalPayable: roundMoney(totalPayable),
      totalPaid: roundMoney(totalPaid),
      totalOutstanding: roundMoney(totalOutstanding),
      overdueOutstanding: roundMoney(overdueOutstanding),
      overdueCount,
      openDocuments: documents.filter((d) => d.status !== FinancialDocumentStatus.PAID).length,
      paymentsThisMonth: {
        total: roundMoney(num(monthPayments._sum.amount)),
        count: monthPayments._count._all,
      },
      counterpartyBalances: counterpartyBalances
        .filter((b) => b.counterpartyId)
        .map((b) => ({
          counterpartyId: b.counterpartyId,
          name: nameById.get(b.counterpartyId!)?.name ?? 'Unknown',
          type: nameById.get(b.counterpartyId!)?.type ?? 'OTHER',
          documentCount: b._count._all,
          totalAmount: roundMoney(num(b._sum.totalAmount)),
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 15),
    };
  }

  /**
   * Every imported payable whose legacy REST disagrees with the ledger balance.
   * The legacy figures are shown untouched next to the calculated balance.
   */
  async reconciliationReport(page: number, pageSize: number): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.FinancialDocumentWhereInput = {
      deletedAt: null,
      importRunId: { not: null },
      legacyRestRaw: { not: null },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.financialDocument.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'asc' },
        include: {
          counterparty: { select: { id: true, name: true } },
          payments: { select: { amount: true, status: true } },
          importRun: { select: { id: true, sourceFilename: true } },
        },
      }),
      this.prisma.financialDocument.count({ where }),
    ]);

    // The reconciliation issue raised at import time, so a finance user can
    // resolve the mismatch from this screen rather than hunting for it in
    // Data Quality.
    const issues = await this.prisma.dataQualityIssue.findMany({
      where: {
        category: 'FINANCIAL_RECONCILIATION_MISMATCH',
        entityType: 'FinancialDocument',
        entityId: { in: rows.map((r) => r.id) },
      },
      select: { id: true, entityId: true, status: true, resolutionNotes: true },
    });
    const issueByDocument = new Map(issues.map((i) => [i.entityId, i]));

    const data = rows.map((doc) => {
      const payments = doc.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const reconciliation = reconcileLegacyPayment({
        legacyTotal: this.parseLegacyNumber(doc.legacyTotalRaw),
        legacyPaid: this.parseLegacyNumber(doc.legacyPaidRaw),
        legacyRest: this.parseLegacyNumber(doc.legacyRestRaw),
        totalAmount: num(doc.totalAmount),
        payments,
      });
      return {
        id: doc.id,
        reference: doc.reference,
        counterparty: doc.counterparty,
        serviceDescription: doc.serviceDescription,
        totalAmount: num(doc.totalAmount),
        legacyTotalRaw: doc.legacyTotalRaw,
        legacyPaidRaw: doc.legacyPaidRaw,
        legacyRestRaw: doc.legacyRestRaw,
        legacyStatusRaw: doc.legacyStatusRaw,
        calculatedOutstanding: reconciliation.canonicalOutstanding,
        difference: reconciliation.difference,
        mismatch: reconciliation.mismatch,
        restLooksLikeSum: reconciliation.restLooksLikeSum,
        reason: reconciliation.reason,
        source: doc.legacySource,
        importRun: doc.importRun,
        issue: issueByDocument.get(doc.id) ?? null,
      };
    });

    return { data, meta: buildPaginationMeta(page, pageSize, total) };
  }

  // -------------------------------------------------------------------------
  // Partner settlements
  // -------------------------------------------------------------------------

  async listSettlements(query: {
    page: number; pageSize: number; partnerId?: string; status?: string;
  }): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.SettlementWhereInput = {
      deletedAt: null,
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.settlement.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          partner: { select: { id: true, name: true, nameAr: true } },
          payments: { select: { amount: true, status: true } },
        },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    const data = rows.map((s) => {
      const payments = s.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      return {
        ...s,
        totalAmount: num(s.totalAmount),
        paidAmount: calculatePaid(payments),
        outstanding: calculateOutstanding(num(s.totalAmount), payments),
      };
    });

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  /** Running balance with one partner, across settlements and payables. */
  async partnerLedger(partnerId: string): Promise<unknown> {
    const [partner, settlements, documents] = await Promise.all([
      this.prisma.partner.findFirst({ where: { id: partnerId, deletedAt: null } }),
      this.prisma.settlement.findMany({
        where: { partnerId, deletedAt: null },
        include: { payments: { select: { amount: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.financialDocument.findMany({
        where: { deletedAt: null, counterparty: { partnerId } },
        include: { payments: { select: { amount: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!partner) throw new NotFoundError('Partner', partnerId);

    const toEntry = (
      kind: string,
      row: { id: string; reference: string; createdAt: Date; totalAmount: Prisma.Decimal; currency: string;
             description?: string | null; serviceDescription?: string | null;
             payments: Array<{ amount: Prisma.Decimal; status: string }> },
    ) => {
      const payments = row.payments.map((p) => ({
        amount: num(p.amount),
        status: p.status as (typeof PaymentStatus)[keyof typeof PaymentStatus],
      }));
      const total = num(row.totalAmount);
      return {
        kind,
        id: row.id,
        reference: row.reference,
        date: row.createdAt,
        description: row.description ?? row.serviceDescription ?? null,
        currency: row.currency,
        totalAmount: total,
        paidAmount: calculatePaid(payments),
        outstanding: calculateOutstanding(total, payments),
      };
    };

    const entries = [
      ...settlements.map((s) => toEntry('SETTLEMENT', s)),
      ...documents.map((d) => toEntry('PAYABLE', d)),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      partner,
      entries,
      totals: {
        totalAmount: roundMoney(entries.reduce((n, e) => n + e.totalAmount, 0)),
        paidAmount: roundMoney(entries.reduce((n, e) => n + e.paidAmount, 0)),
        outstanding: roundMoney(entries.reduce((n, e) => n + e.outstanding, 0)),
      },
    };
  }
}
