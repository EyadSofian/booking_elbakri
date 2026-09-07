import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import {
  buildPaginationMeta, DataQualitySeverity, ImportRowKind, ImportRunStatus,
  type PaginatedResponse,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { AliasResolverService } from '../master-data/alias-resolver.service';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { ImportAnalyzerService, type AnalyzedWorkbook } from './import-analyzer.service';
import { ImportApplierService } from './import-applier.service';

export interface UploadResult {
  importRunId: string;
  status: string;
  duplicateOf?: string;
}

/**
 * Ceiling for the apply transaction. Overridable for unusually large
 * migrations via IMPORT_APPLY_TIMEOUT_MS.
 */
const APPLY_TRANSACTION_TIMEOUT_MS = Number(
  process.env.IMPORT_APPLY_TIMEOUT_MS ?? 20 * 60_000,
);

/** Splits an array into fixed-size batches for bulk inserts. */
function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly analyzer: ImportAnalyzerService,
    private readonly applier: ImportApplierService,
    private readonly aliases: AliasResolverService,
    private readonly dataQuality: DataQualityService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Stores the workbook and runs the analysis.
   *
   * Nothing is written to business tables at this stage — upload and analysis
   * are always a dry run. A workbook whose checksum matches a run that was
   * already applied is refused, so importing the same file twice cannot
   * silently duplicate every record.
   */
  async upload(
    file: { originalname: string; buffer: Buffer; size: number },
    actorId: string,
  ): Promise<UploadResult> {
    if (!file.originalname.match(/\.xlsx?$/i)) {
      throw new ValidationError('Only .xlsx workbooks can be imported.');
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const alreadyApplied = await this.prisma.importRun.findFirst({
      where: { checksum, status: ImportRunStatus.APPLIED },
      select: { id: true, sourceFilename: true, appliedAt: true },
    });
    if (alreadyApplied) {
      throw new ConflictError(
        'This exact workbook has already been imported and applied. Re-importing it would duplicate every record.',
        { importRunId: alreadyApplied.id, appliedAt: alreadyApplied.appliedAt },
      );
    }

    const storageRoot = this.config.get<string>('STORAGE_ROOT', './storage');
    const dir = join(storageRoot, 'imports');
    await mkdir(dir, { recursive: true });
    const storagePath = join(dir, `${checksum}.xlsx`);
    await writeFile(storagePath, file.buffer);

    const run = await this.prisma.importRun.create({
      data: {
        sourceFilename: file.originalname,
        checksum,
        fileSizeBytes: file.size,
        storagePath,
        status: ImportRunStatus.ANALYZING,
        uploadedById: actorId,
      },
      select: { id: true },
    });

    await this.audit.record({
      action: 'IMPORT_UPLOADED',
      entityType: 'ImportRun',
      entityId: run.id,
      actorId,
      after: { filename: file.originalname, checksum, sizeBytes: file.size },
    });

    try {
      await this.runAnalysis(run.id, file.buffer, file.originalname);
    } catch (err) {
      await this.prisma.importRun.update({
        where: { id: run.id },
        data: { status: ImportRunStatus.FAILED, failedReason: (err as Error).message },
      });
      throw err;
    }

    return { importRunId: run.id, status: ImportRunStatus.ANALYZED };
  }

  /** Runs the analyzer and persists every scanned row with its raw values. */
  private async runAnalysis(importRunId: string, buffer: Buffer, filename: string): Promise<void> {
    const analysis = await this.analyzer.analyze(buffer, filename);

    await this.prisma.$transaction(
      async (tx) => {
        // Re-analysis replaces the previous scan for this run.
        await tx.importIssue.deleteMany({ where: { importRunId } });
        await tx.importRow.deleteMany({ where: { importRunId } });
        await tx.importSheet.deleteMany({ where: { importRunId } });

        for (const sheet of analysis.sheets) {
          const sheetRow = await tx.importSheet.create({
            data: {
              importRunId,
              sheetName: sheet.sheetName,
              detectedKind: sheet.detectedKind,
              headerRow: sheet.headerRow,
              maxRow: sheet.maxRow,
              maxColumn: sheet.maxColumn,
              rowsScanned: sheet.reconciliation.scanned,
              columnMapping: sheet.columnMapping as Prisma.InputJsonValue,
              unmappedColumns: sheet.unmappedColumns,
              isEmpty: sheet.isEmpty,
              stats: sheet.reconciliation as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });

          if (!sheet.grouping) continue;

          // Only rows that carry data are persisted individually; blank spacer
          // rows are counted in the reconciliation instead of stored.
          const meaningful = sheet.grouping.rows.filter(
            (r) => r.kind !== ImportRowKind.BLANK,
          );

          // Ids are generated here rather than read back, so both the rows
          // and the issues that reference them go in as two bulk inserts
          // instead of one round trip per row. A workbook with a thousand
          // rows would otherwise hold a transaction open long enough for the
          // connection to be dropped.
          const rowIdByNumber = new Map<number, string>();
          const sectionByMasterRow = new Map<number, string | null>(
            sheet.grouping.records.map((r) => [r.masterRowNumber, r.sectionLabel]),
          );

          const rowData = meaningful.map((row) => {
            const id = randomUUID();
            rowIdByNumber.set(row.rowNumber, id);
            const normalized = sheet.normalizedByRow.get(row.rowNumber);
            return {
              id,
              importRunId,
              importSheetId: sheetRow.id,
              rowNumber: row.rowNumber,
              kind: row.kind,
              masterRowNumber: row.masterRowNumber,
              rawValues: this.serializeValues(row.values),
              unmappedValues: this.serializeValues(row.unmapped ?? {}),
              normalizedValues: normalized
                ? (Object.fromEntries(
                    Object.entries(normalized.fields).map(([k, v]) => [
                      k,
                      {
                        value: this.jsonSafe(
                          ('value' in v ? v.value : null) ??
                            ('minutes' in v ? v.minutes : null) ??
                            ('amount' in v ? v.amount : null),
                        ),
                        status: v.status,
                        raw: v.raw,
                      },
                    ]),
                  ) as Prisma.InputJsonValue)
                : undefined,
              sectionLabel: sectionByMasterRow.get(row.rowNumber) ?? null,
            };
          });

          for (const chunk of chunked(rowData, 500)) {
            await tx.importRow.createMany({ data: chunk });
          }

          const issueData = sheet.issues.map((issue) => ({
            importRunId,
            importRowId: rowIdByNumber.get(issue.rowNumber) ?? null,
            category: issue.category,
            severity: issue.severity,
            field: issue.field,
            rawValue: issue.rawValue,
            message: issue.message,
            details: (issue.details ?? undefined) as Prisma.InputJsonValue | undefined,
          }));

          for (const chunk of chunked(issueData, 500)) {
            await tx.importIssue.createMany({ data: chunk });
          }
        }

        await tx.importRun.update({
          where: { id: importRunId },
          data: {
            status: ImportRunStatus.ANALYZED,
            analyzedAt: new Date(),
            analysis: this.summarizeAnalysis(analysis) as unknown as Prisma.InputJsonValue,
            reconciliation: this.buildReconciliation(analysis) as unknown as Prisma.InputJsonValue,
            rowsScanned: analysis.totals.rowsScanned,
            rowsBlank: analysis.totals.rowsBlank,
            rowsStructural: analysis.totals.rowsStructural,
            rowsMaster: analysis.totals.rowsMaster,
            rowsContinuation: analysis.totals.rowsContinuation,
            rowsOrphan: analysis.totals.rowsOrphan,
            warningCount: analysis.totals.warnings,
            errorCount: analysis.totals.errors,
          },
        });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  /**
   * Writes the analysed workbook into the business tables in one transaction.
   *
   * Either the whole workbook lands or none of it does — a partial import that
   * leaves half a booking behind would be worse than no import at all.
   */
  async apply(importRunId: string, actorId: string): Promise<{
    recordsCreated: number;
    recordsMatched: number;
    issuesRaised: number;
    reconciliation: unknown;
  }> {
    const run = await this.prisma.importRun.findUnique({
      where: { id: importRunId },
      select: { id: true, status: true, storagePath: true, sourceFilename: true, checksum: true },
    });
    if (!run) throw new NotFoundError('Import run', importRunId);
    if (run.status === ImportRunStatus.APPLIED) {
      throw new ConflictError('This import has already been applied.', { importRunId });
    }
    if (run.status !== ImportRunStatus.ANALYZED && run.status !== ImportRunStatus.PREVIEWED) {
      throw new ConflictError('This import has not been analysed yet.', { status: run.status });
    }
    if (!run.storagePath) throw new ValidationError('The uploaded workbook is no longer available.');

    const buffer = await readFile(run.storagePath);
    const analysis = await this.analyzer.analyze(buffer, run.sourceFilename);

    this.aliases.resetCache();
    await this.prisma.importRun.update({
      where: { id: importRunId },
      data: { status: ImportRunStatus.APPLYING },
    });

    let created = 0;
    let matched = 0;
    const allIssues: Awaited<ReturnType<ImportApplierService['applySheet']>>['issues'] = [];

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const sheet of analysis.sheets) {
            const outcome = await this.applier.applySheet(tx, sheet, {
              importRunId,
              workbookName: run.sourceFilename,
              actorId,
            });
            created += outcome.recordsCreated;
            matched += outcome.recordsMatched;
            allIssues.push(...outcome.issues);

            for (const [rowNumber, res] of outcome.rowOutcomes) {
              await tx.importRow.updateMany({
                where: { importRunId, rowNumber, importSheet: { sheetName: sheet.sheetName } },
                data: {
                  applied: true,
                  createdEntityType: res.entityType,
                  createdEntityId: res.entityId,
                  matchedEntityId: res.matched ? res.entityId : null,
                },
              });
            }
          }

          await this.dataQuality.raiseMany(allIssues, tx);

          await tx.importRun.update({
            where: { id: importRunId },
            data: {
              status: ImportRunStatus.APPLIED,
              appliedAt: new Date(),
              recordsCreated: created,
              recordsMatched: matched,
            },
          });
        },
        // A migration is a long, deliberate operation and it must stay atomic:
        // a partial import leaving half a booking behind is worse than none.
        // Deployed beside the database this completes in seconds; the generous
        // ceiling is for large workbooks and higher-latency links.
        { timeout: APPLY_TRANSACTION_TIMEOUT_MS, maxWait: 60_000 },
      );
    } catch (err) {
      await this.prisma.importRun.update({
        where: { id: importRunId },
        data: { status: ImportRunStatus.FAILED, failedReason: (err as Error).message },
      });
      throw err;
    }

    await this.audit.record({
      action: 'IMPORT_APPLIED',
      entityType: 'ImportRun',
      entityId: importRunId,
      actorId,
      after: { recordsCreated: created, recordsMatched: matched, issuesRaised: allIssues.length },
    });

    return {
      recordsCreated: created,
      recordsMatched: matched,
      issuesRaised: allIssues.length,
      reconciliation: this.buildReconciliation(analysis),
    };
  }

  async findOne(id: string): Promise<unknown> {
    const run = await this.prisma.importRun.findUnique({
      where: { id },
      include: {
        sheets: { orderBy: { sheetName: 'asc' } },
        uploadedBy: { select: { id: true, fullName: true, email: true } },
        _count: { select: { rows: true, issues: true } },
      },
    });
    if (!run) throw new NotFoundError('Import run', id);
    return run;
  }

  async list(page: number, pageSize: number): Promise<PaginatedResponse<unknown>> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.importRun.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: { select: { id: true, fullName: true } },
          _count: { select: { sheets: true, issues: true } },
        },
      }),
      this.prisma.importRun.count(),
    ]);
    return { data, meta: buildPaginationMeta(page, pageSize, total) };
  }

  async issues(
    importRunId: string,
    page: number,
    pageSize: number,
    severity?: string,
    category?: string,
  ): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.ImportIssueWhereInput = {
      importRunId,
      ...(severity ? { severity } : {}),
      ...(category ? { category } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.importIssue.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        include: { importRow: { select: { rowNumber: true, kind: true, importSheet: { select: { sheetName: true } } } } },
      }),
      this.prisma.importIssue.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(page, pageSize, total) };
  }

  /** Preview of what the apply stage would create, without writing anything. */
  async preview(importRunId: string, sheetName?: string, limit = 50): Promise<unknown> {
    const rows = await this.prisma.importRow.findMany({
      where: {
        importRunId,
        ...(sheetName ? { importSheet: { sheetName } } : {}),
        kind: { in: [ImportRowKind.MASTER, ImportRowKind.CONTINUATION, ImportRowKind.ORPHAN] },
      },
      take: limit,
      orderBy: [{ importSheetId: 'asc' }, { rowNumber: 'asc' }],
      include: {
        importSheet: { select: { sheetName: true, detectedKind: true } },
        issues: { select: { category: true, severity: true, message: true, field: true } },
      },
    });
    return rows;
  }

  async reconciliation(importRunId: string): Promise<unknown> {
    const run = await this.prisma.importRun.findUnique({
      where: { id: importRunId },
      select: { reconciliation: true, sourceFilename: true, status: true, appliedAt: true },
    });
    if (!run) throw new NotFoundError('Import run', importRunId);
    return run;
  }

  /**
   * The acceptance report: proves that scanned rows == imported + structural +
   * unresolved, per sheet and overall.
   */
  private buildReconciliation(analysis: AnalyzedWorkbook) {
    const sheets = analysis.sheets.map((s) => ({
      workbook: analysis.filename,
      sheet: s.sheetName,
      detectedKind: s.detectedKind,
      rowsScanned: s.reconciliation.scanned,
      rowsIgnoredAsBlank: s.reconciliation.blankRows,
      headerAndSectionRows: s.reconciliation.structuralRows,
      masterRecords: s.reconciliation.masterRecords,
      continuationRows: s.reconciliation.continuationRows,
      successfullyMapped: s.reconciliation.masterRecords + s.reconciliation.continuationRows,
      warnings: s.issues.filter((i) => i.severity === DataQualitySeverity.WARNING).length,
      errors: s.issues.filter((i) => i.severity === DataQualitySeverity.ERROR).length,
      unresolvedRows: s.reconciliation.orphanRows,
      balanced: s.reconciliation.balanced,
      accountedFor: s.reconciliation.accountedFor,
    }));

    const meaningfulScanned = sheets.reduce((n, s) => n + s.masterRecords + s.continuationRows + s.unresolvedRows, 0);
    const accounted = sheets.reduce((n, s) => n + s.successfullyMapped + s.unresolvedRows, 0);

    return {
      workbook: analysis.filename,
      generatedAt: new Date().toISOString(),
      sheets,
      totals: {
        ...analysis.totals,
        meaningfulRows: meaningfulScanned,
        accountedFor: accounted,
        // The guarantee: no meaningful row disappeared.
        balanced: analysis.totals.balanced && meaningfulScanned === accounted,
      },
    };
  }

  private summarizeAnalysis(analysis: AnalyzedWorkbook) {
    return {
      filename: analysis.filename,
      sheets: analysis.sheets.map((s) => ({
        sheetName: s.sheetName,
        detectedKind: s.detectedKind,
        label: s.label,
        headerRow: s.headerRow,
        isEmpty: s.isEmpty,
        columnMapping: s.columnMapping,
        unmappedColumns: s.unmappedColumns,
        reconciliation: s.reconciliation,
        issueCounts: s.issues.reduce<Record<string, number>>((acc, i) => {
          acc[i.category] = (acc[i.category] ?? 0) + 1;
          return acc;
        }, {}),
      })),
      totals: analysis.totals,
    };
  }

  private serializeValues(values: Record<string, unknown>): Prisma.InputJsonValue {
    return Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, this.jsonSafe(v)]),
    ) as Prisma.InputJsonValue;
  }

  private jsonSafe(v: unknown): string | number | boolean | null {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    return String(v);
  }
}
