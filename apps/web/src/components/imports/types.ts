/** Shapes returned by the import endpoints. */

export interface ImportSheetRow {
  id: string;
  sheetName: string;
  detectedKind: string | null;
  headerRow: number | null;
  maxRow: number;
  rowsScanned: number;
  columnMapping: Record<string, string> | null;
  unmappedColumns: string[];
  isEmpty: boolean;
  stats: {
    balanced: boolean;
    scanned: number;
    accountedFor: number;
    masterRecords: number;
    continuationRows: number;
    structuralRows: number;
    blankRows: number;
    orphanRows: number;
  } | null;
}

export interface ReconciliationSheet {
  sheet: string;
  detectedKind: string;
  rowsScanned: number;
  rowsIgnoredAsBlank: number;
  headerAndSectionRows: number;
  masterRecords: number;
  continuationRows: number;
  successfullyMapped: number;
  warnings: number;
  errors: number;
  unresolvedRows: number;
  balanced: boolean;
}

export interface ImportRunDetail {
  id: string;
  sourceFilename: string;
  checksum: string;
  fileSizeBytes: number;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  failedReason: string | null;
  rowsScanned: number;
  rowsBlank: number;
  rowsStructural: number;
  rowsMaster: number;
  rowsContinuation: number;
  rowsOrphan: number;
  recordsCreated: number;
  recordsMatched: number;
  warningCount: number;
  errorCount: number;
  reconciliation: {
    sheets: ReconciliationSheet[];
    totals: {
      rowsScanned: number;
      meaningfulRows: number;
      accountedFor: number;
      balanced: boolean;
    };
  } | null;
  uploadedBy: { id: string; fullName: string; email: string } | null;
  sheets: ImportSheetRow[];
  _count: { rows: number; issues: number };
}

export interface ImportIssueRow {
  id: string;
  category: string;
  severity: string;
  field: string | null;
  rawValue: string | null;
  message: string;
  importRow: {
    rowNumber: number;
    kind: string;
    importSheet: { sheetName: string };
  } | null;
}

/** An unresolved legacy value awaiting a human decision. */
export interface AliasSuggestion {
  id: string;
  entityType: string;
  rawValue: string;
  aliasKey: string;
  suggestedId: string | null;
  suggestedName: string | null;
  score: number | null;
  status: string;
  occurrences: number;
  importRunId: string | null;
  createdAt: string;
}

export interface ImportTabContext {
  run: ImportRunDetail;
  runId: string;
}
