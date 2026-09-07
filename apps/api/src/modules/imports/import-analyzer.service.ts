import { Injectable, Logger } from '@nestjs/common';
import {
  DataQualityCategory, DataQualitySeverity, ImportRowKind,
  groupLegacyRows, reconcileGrouping,
  type GroupingResult, type RawRow,
} from '@elbakri/shared';
import { WorkbookReader, type SheetScan, type WorkbookScan } from './workbook-reader';
import { normalizeRow, type FieldIssue, type NormalizedRow } from './row-normalizer';
import type { SheetProfile } from './sheet-profiles';

export interface AnalyzedSheet {
  sheetName: string;
  detectedKind: string;
  label: string;
  headerRow: number | null;
  maxRow: number;
  maxColumn: number;
  isEmpty: boolean;
  columnMapping: Record<string, string>;
  unmappedColumns: string[];
  grouping: GroupingResult | null;
  normalizedByRow: Map<number, NormalizedRow>;
  issues: Array<FieldIssue & { rowNumber: number }>;
  reconciliation: {
    balanced: boolean;
    scanned: number;
    accountedFor: number;
    meaningfulRows: number;
    masterRecords: number;
    continuationRows: number;
    structuralRows: number;
    blankRows: number;
    orphanRows: number;
    breakdown: Record<string, number>;
  };
}

export interface AnalyzedWorkbook {
  filename: string;
  sheets: AnalyzedSheet[];
  totals: {
    sheets: number;
    rowsScanned: number;
    rowsBlank: number;
    rowsStructural: number;
    rowsMaster: number;
    rowsContinuation: number;
    rowsOrphan: number;
    warnings: number;
    errors: number;
    balanced: boolean;
  };
}

@Injectable()
export class ImportAnalyzerService {
  private readonly logger = new Logger(ImportAnalyzerService.name);

  /**
   * Reads a workbook and produces the full analysis: detected layouts, grouped
   * master/continuation records, per-field parse issues and a reconciliation
   * that proves every scanned row is accounted for.
   *
   * Nothing is written to business tables here. Analysis is always a dry run.
   */
  async analyze(buffer: Buffer, filename: string): Promise<AnalyzedWorkbook> {
    const scan: WorkbookScan = await WorkbookReader.scan(buffer, filename);
    const sheets = scan.sheets.map((s) => this.analyzeSheet(s));

    const totals = sheets.reduce(
      (acc, s) => {
        acc.rowsScanned += s.reconciliation.scanned;
        acc.rowsBlank += s.reconciliation.blankRows;
        acc.rowsStructural += s.reconciliation.structuralRows;
        acc.rowsMaster += s.reconciliation.masterRecords;
        acc.rowsContinuation += s.reconciliation.continuationRows;
        acc.rowsOrphan += s.reconciliation.orphanRows;
        acc.warnings += s.issues.filter((i) => i.severity === DataQualitySeverity.WARNING).length;
        acc.errors += s.issues.filter((i) => i.severity === DataQualitySeverity.ERROR).length;
        acc.balanced = acc.balanced && s.reconciliation.balanced;
        return acc;
      },
      {
        sheets: sheets.length,
        rowsScanned: 0, rowsBlank: 0, rowsStructural: 0,
        rowsMaster: 0, rowsContinuation: 0, rowsOrphan: 0,
        warnings: 0, errors: 0, balanced: true,
      },
    );

    return { filename: scan.filename, sheets, totals };
  }

  private analyzeSheet(scan: SheetScan): AnalyzedSheet {
    const base = {
      sheetName: scan.sheetName,
      detectedKind: scan.detectedKind,
      headerRow: scan.headerRow,
      maxRow: scan.maxRow,
      maxColumn: scan.maxColumn,
      isEmpty: scan.isEmpty,
      columnMapping: scan.columnMapping,
      unmappedColumns: scan.unmappedColumns,
    };

    // An empty worksheet is reported, not invented around.
    if (scan.isEmpty || !scan.profile) {
      const meaningful = scan.rows.filter(
        (r) => Object.keys(r.values).length > 0 || Object.keys(r.unmapped ?? {}).length > 0,
      ).length;
      return {
        ...base,
        label: scan.isEmpty ? 'Empty sheet' : 'Unrecognised layout',
        grouping: null,
        normalizedByRow: new Map(),
        issues: scan.isEmpty
          ? []
          : [{
              rowNumber: scan.headerRow ?? 1,
              field: '__sheet__',
              category: DataQualityCategory.UNKNOWN_LEGACY_COLUMN,
              severity: DataQualitySeverity.WARNING,
              rawValue: scan.sheetName,
              message: `Sheet "${scan.sheetName}" holds ${meaningful} non-empty rows but its layout was not recognised. No mapping was applied and no data was imported from it.`,
            }],
        reconciliation: {
          balanced: true,
          scanned: scan.rows.length,
          accountedFor: scan.rows.length,
          meaningfulRows: meaningful,
          masterRecords: 0,
          continuationRows: 0,
          structuralRows: 0,
          blankRows: scan.rows.length - meaningful,
          orphanRows: 0,
          breakdown: { unmapped: meaningful },
        },
      };
    }

    const profile: SheetProfile = scan.profile;
    const grouping = groupLegacyRows(scan.rows as RawRow[], {
      masterField: profile.masterField,
      serviceFields: profile.serviceFields,
      headerRow: scan.headerRow ?? profile.defaultHeaderRow,
    });

    // The dominant year in the sheet, used to fill in dates like "22 يوليو"
    // that omit one. It is recorded as an assumption, never as fact.
    const assumeYear = this.dominantYear(scan.rows, profile);

    const normalizedByRow = new Map<number, NormalizedRow>();
    const issues: Array<FieldIssue & { rowNumber: number }> = [];

    for (const row of grouping.rows) {
      if (row.kind !== ImportRowKind.MASTER && row.kind !== ImportRowKind.CONTINUATION && row.kind !== ImportRowKind.ORPHAN) {
        continue;
      }
      const normalized = normalizeRow(row, profile, { assumeYear });
      normalizedByRow.set(row.rowNumber, normalized);
      for (const issue of normalized.issues) {
        issues.push({ ...issue, rowNumber: row.rowNumber });
      }
    }

    for (const orphan of grouping.orphans) {
      issues.push({
        rowNumber: orphan.rowNumber,
        field: profile.masterField,
        category: DataQualityCategory.ORPHAN_CONTINUATION_ROW,
        severity: DataQualitySeverity.ERROR,
        rawValue: null,
        message: `Row ${orphan.rowNumber} carries service data but has no name and no preceding record to attach it to. It has not been imported and needs a decision.`,
      });
    }

    const rec = reconcileGrouping(grouping);
    const structural = rec.breakdown.banner + rec.breakdown.header + rec.breakdown.section;

    return {
      ...base,
      label: profile.label,
      grouping,
      normalizedByRow,
      issues,
      reconciliation: {
        balanced: rec.balanced,
        scanned: rec.scanned,
        accountedFor: rec.accountedFor,
        meaningfulRows: rec.breakdown.master + rec.breakdown.continuation + rec.breakdown.orphan,
        masterRecords: rec.breakdown.master,
        continuationRows: rec.breakdown.continuation,
        structuralRows: structural,
        blankRows: rec.breakdown.blank,
        orphanRows: rec.breakdown.orphan,
        breakdown: { ...rec.breakdown },
      },
    };
  }

  /**
   * Picks the most common year among the sheet's parseable dates.
   *
   * Legacy rows such as "22 يوليو" have no year. Rather than defaulting to the
   * current year — which would silently backdate or forward-date a booking —
   * the sheet's own dominant year is used and every such date is flagged
   * ASSUMED_YEAR for review.
   */
  private dominantYear(rows: RawRow[], profile: SheetProfile): number | undefined {
    const counts = new Map<number, number>();
    const dateFields = profile.columns.filter((c) => c.kind === 'date').map((c) => c.field);

    for (const row of rows) {
      for (const field of dateFields) {
        const v = row.values[field];
        if (v instanceof Date && !Number.isNaN(v.getTime())) {
          const y = v.getUTCFullYear();
          counts.set(y, (counts.get(y) ?? 0) + 1);
        }
      }
    }
    if (!counts.size) return undefined;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
}
