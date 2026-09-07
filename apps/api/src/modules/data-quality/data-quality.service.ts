import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  buildPaginationMeta, DataQualityCategory, DataQualitySeverity, DataQualityStatus,
  type PaginatedResponse,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundError, ValidationError } from '../../common/errors';

export interface RaiseIssueInput {
  category: DataQualityCategory;
  severity?: DataQualitySeverity;
  entityType: string;
  entityId?: string | null;
  field?: string | null;
  rawValue?: string | null;
  message: string;
  suggestion?: string | null;
  details?: Record<string, unknown>;
  sourceWorkbook?: string | null;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  importRunId?: string | null;
}

export interface IssueQuery {
  page: number;
  pageSize: number;
  status?: string;
  category?: string;
  severity?: string;
  entityType?: string;
  assignedToId?: string;
  importRunId?: string;
  q?: string;
}

@Injectable()
export class DataQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A stable identity for an issue.
   *
   * Re-running analysis over the same source row updates the existing issue
   * instead of creating a duplicate — and, crucially, an issue that a user has
   * already resolved is not silently reopened by a refresh.
   */
  static fingerprint(input: RaiseIssueInput): string {
    const parts = [
      input.category,
      input.entityType,
      input.entityId ?? '',
      input.field ?? '',
      input.sourceWorkbook ?? '',
      input.sourceSheet ?? '',
      input.sourceRow?.toString() ?? '',
    ].join('|');
    return createHash('sha256').update(parts).digest('hex').slice(0, 40);
  }

  async raise(input: RaiseIssueInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const fingerprint = DataQualityService.fingerprint(input);

    await client.dataQualityIssue.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        category: input.category,
        severity: input.severity ?? DataQualitySeverity.WARNING,
        status: DataQualityStatus.OPEN,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        field: input.field ?? null,
        rawValue: input.rawValue ?? null,
        message: input.message,
        suggestion: input.suggestion ?? null,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
        sourceWorkbook: input.sourceWorkbook ?? null,
        sourceSheet: input.sourceSheet ?? null,
        sourceRow: input.sourceRow ?? null,
        importRunId: input.importRunId ?? null,
      },
      // Refresh the description but never resurrect a decision a user made.
      update: {
        message: input.message,
        suggestion: input.suggestion ?? null,
        rawValue: input.rawValue ?? null,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
        severity: input.severity ?? DataQualitySeverity.WARNING,
        entityId: input.entityId ?? undefined,
      },
    });
  }

  async raiseMany(inputs: RaiseIssueInput[], tx?: Prisma.TransactionClient): Promise<void> {
    for (const i of inputs) await this.raise(i, tx);
  }

  async list(query: IssueQuery): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.DataQualityIssueWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.importRunId ? { importRunId: query.importRunId } : {}),
      ...(query.q
        ? {
            OR: [
              { message: { contains: query.q, mode: 'insensitive' } },
              { rawValue: { contains: query.q, mode: 'insensitive' } },
              { entityId: { equals: query.q } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.dataQualityIssue.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignedTo: { select: { id: true, fullName: true, email: true } },
          resolvedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.dataQualityIssue.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async summary(): Promise<{
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    openTotal: number;
  }> {
    const openish = { status: { in: [DataQualityStatus.OPEN, DataQualityStatus.REVIEWING] } };

    const [byStatus, byCategory, bySeverity] = await Promise.all([
      this.prisma.dataQualityIssue.groupBy({
        by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' },
      }),
      this.prisma.dataQualityIssue.groupBy({
        by: ['category'], _count: { _all: true }, where: openish, orderBy: { category: 'asc' },
      }),
      this.prisma.dataQualityIssue.groupBy({
        by: ['severity'], _count: { _all: true }, where: openish, orderBy: { severity: 'asc' },
      }),
    ]);

    const toMap = <K extends string>(
      rows: Array<Record<string, unknown> & { _count?: { _all?: number } }>,
      key: K,
    ): Record<string, number> =>
      Object.fromEntries(rows.map((r) => [String(r[key]), r._count?._all ?? 0]));

    const statusMap = toMap(byStatus, 'status');
    return {
      byStatus: statusMap,
      byCategory: toMap(byCategory, 'category'),
      bySeverity: toMap(bySeverity, 'severity'),
      openTotal: (statusMap[DataQualityStatus.OPEN] ?? 0) + (statusMap[DataQualityStatus.REVIEWING] ?? 0),
    };
  }

  async assign(id: string, assignedToId: string | null, actorId: string): Promise<unknown> {
    const before = await this.prisma.dataQualityIssue.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Data quality issue', id);

    const updated = await this.prisma.dataQualityIssue.update({
      where: { id },
      data: {
        assignedToId,
        status: assignedToId && before.status === DataQualityStatus.OPEN
          ? DataQualityStatus.REVIEWING
          : before.status,
      },
    });
    await this.audit.record({
      action: 'DATA_QUALITY_ISSUE_ASSIGNED',
      entityType: 'DataQualityIssue',
      entityId: id,
      actorId,
      before: { assignedToId: before.assignedToId },
      after: { assignedToId },
    });
    return updated;
  }

  /**
   * Close an issue. An ignored issue must carry a reason — "no issue should
   * disappear merely because a page refreshed" applies to dismissal too.
   */
  async resolve(
    id: string,
    status: typeof DataQualityStatus.RESOLVED | typeof DataQualityStatus.IGNORED_WITH_REASON,
    notes: string | undefined,
    actorId: string,
  ): Promise<unknown> {
    const before = await this.prisma.dataQualityIssue.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Data quality issue', id);

    if (status === DataQualityStatus.IGNORED_WITH_REASON && !notes?.trim()) {
      throw new ValidationError('A reason is required when ignoring a data quality issue.');
    }

    const updated = await this.prisma.dataQualityIssue.update({
      where: { id },
      data: {
        status,
        resolutionNotes: notes ?? null,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });
    await this.audit.record({
      action: status === DataQualityStatus.RESOLVED
        ? 'DATA_QUALITY_ISSUE_RESOLVED'
        : 'DATA_QUALITY_ISSUE_IGNORED',
      entityType: 'DataQualityIssue',
      entityId: id,
      actorId,
      before: { status: before.status },
      after: { status, resolutionNotes: notes },
    });
    return updated;
  }

  async reopen(id: string, actorId: string): Promise<unknown> {
    const updated = await this.prisma.dataQualityIssue.update({
      where: { id },
      data: { status: DataQualityStatus.OPEN, resolvedById: null, resolvedAt: null },
    });
    await this.audit.record({
      action: 'DATA_QUALITY_ISSUE_REOPENED',
      entityType: 'DataQualityIssue',
      entityId: id,
      actorId,
    });
    return updated;
  }

  async findOne(id: string): Promise<unknown> {
    const issue = await this.prisma.dataQualityIssue.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        resolvedBy: { select: { id: true, fullName: true } },
        importRun: { select: { id: true, sourceFilename: true, createdAt: true } },
      },
    });
    if (!issue) throw new NotFoundError('Data quality issue', id);
    return issue;
  }
}
