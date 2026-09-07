import { ImportRowKind } from '../domain/enums';
import { cleanDisplay, isEmptyMarker, normalizeForSearch } from './text';

/** One physical worksheet row reduced to its mapped logical fields. */
export interface RawRow {
  /** 1-based physical row number in the worksheet. */
  rowNumber: number;
  /** Logical field name -> raw cell value (merge anchors already resolved). */
  values: Record<string, unknown>;
  /** Values from columns that have no mapping. Never discarded. */
  unmapped?: Record<string, unknown>;
}

export interface ClassifiedRow extends RawRow {
  kind: ImportRowKind;
  /** rowNumber of the master this row belongs to; null for masters/structure. */
  masterRowNumber: number | null;
  notes: string[];
}

export interface GroupedRecord {
  masterRowNumber: number;
  master: RawRow;
  continuations: RawRow[];
  /** Section label in force when this record was read, e.g. "new 2026". */
  sectionLabel: string | null;
}

export interface GroupingResult {
  rows: ClassifiedRow[];
  records: GroupedRecord[];
  orphans: ClassifiedRow[];
  sections: Array<{ rowNumber: number; label: string }>;
  stats: {
    scanned: number;
    blank: number;
    banner: number;
    header: number;
    section: number;
    master: number;
    continuation: number;
    orphan: number;
  };
}

export interface GroupingOptions {
  /** Field that identifies a new master record (usually `name`). */
  masterField: string;
  /**
   * Fields that make a blank-name row meaningful. A row with none of these and
   * no master field is structurally empty.
   */
  serviceFields: string[];
  /** 1-based row number of the column header. Rows at or above it are structure. */
  headerRow?: number;
  /**
   * Maximum blank rows tolerated before the active master is closed. The source
   * workbooks use a blank spacer row between records, so a single gap must not
   * break a group.
   */
  maxBlankGap?: number;
}

const SECTION_PATTERNS: RegExp[] = [
  /^new\s+\d{4}$/i,
  /^\d{4}$/,
  /^(january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{0,4}$/i,
  /^(total|totals|summary|grand total)\b/i,
  /^(المجموع|الاجمالي|الإجمالي|اجمالي)\b/,
];

/**
 * Decide whether a lone text value is a divider label rather than a traveller.
 *
 * The VISA sheet contains a row whose NAME cell reads "new 2026". Importing
 * that as a customer would fabricate a traveller, so such rows are recognised
 * structurally: they carry a label and nothing else.
 */
export function looksLikeSectionLabel(value: unknown, otherFieldsEmpty: boolean): boolean {
  const s = cleanDisplay(value);
  if (!s) return false;
  if (!otherFieldsEmpty) return false;
  const norm = normalizeForSearch(s);
  if (!norm) return false;
  if (SECTION_PATTERNS.some((p) => p.test(s.trim()) || p.test(norm))) return true;
  // A cell padded with a long run of spaces is a hand-made centred divider.
  if (/^\s{10,}/.test(String(value)) && norm.length <= 40) return true;
  return false;
}

function hasAnyValue(row: RawRow, fields: string[]): boolean {
  return fields.some((f) => {
    const v = row.values[f];
    if (v === null || v === undefined) return false;
    const s = cleanDisplay(v);
    return s !== null && !isEmptyMarker(s);
  });
}

function isMeaningfullyEmpty(row: RawRow): boolean {
  const all = [...Object.values(row.values), ...Object.values(row.unmapped ?? {})];
  return !all.some((v) => {
    const s = cleanDisplay(v);
    return s !== null && !isEmptyMarker(s);
  });
}

/**
 * Group legacy rows into master records plus their continuation rows.
 *
 * The legacy workbooks deliberately leave NAME blank on rows that continue the
 * record above — a second hotel stay, a return transfer leg, another excursion.
 * Importing those as separate anonymous records would fabricate travellers and
 * lose the relationship, so the parser carries an explicit active master.
 */
export function groupLegacyRows(rows: RawRow[], opts: GroupingOptions): GroupingResult {
  const { masterField, serviceFields } = opts;
  const headerRow = opts.headerRow ?? 0;
  const maxBlankGap = opts.maxBlankGap ?? 3;

  const classified: ClassifiedRow[] = [];
  const records: GroupedRecord[] = [];
  const orphans: ClassifiedRow[] = [];
  const sections: Array<{ rowNumber: number; label: string }> = [];

  let active: GroupedRecord | null = null;
  let blankRun = 0;
  let currentSection: string | null = null;

  const sorted = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);

  for (const row of sorted) {
    const push = (kind: ImportRowKind, masterRowNumber: number | null, notes: string[] = []) => {
      classified.push({ ...row, kind, masterRowNumber, notes });
    };

    if (headerRow && row.rowNumber < headerRow) {
      if (!isMeaningfullyEmpty(row)) push(ImportRowKind.BANNER, null);
      else push(ImportRowKind.BLANK, null);
      continue;
    }
    if (headerRow && row.rowNumber === headerRow) {
      push(ImportRowKind.HEADER, null);
      continue;
    }

    if (isMeaningfullyEmpty(row)) {
      blankRun++;
      push(ImportRowKind.BLANK, null);
      if (active && blankRun > maxBlankGap) {
        // A long gap means the previous record is finished.
        active = null;
      }
      continue;
    }
    blankRun = 0;

    const masterValueRaw = row.values[masterField];
    const masterValue = cleanDisplay(masterValueRaw);
    const hasMaster = masterValue !== null && !isEmptyMarker(masterValue);
    const otherFields = [...serviceFields, ...Object.keys(row.unmapped ?? {})];
    const otherEmpty = !hasAnyValue(row, serviceFields) && !Object.values(row.unmapped ?? {}).some((v) => cleanDisplay(v));

    if (hasMaster && looksLikeSectionLabel(masterValueRaw, otherEmpty)) {
      currentSection = masterValue;
      sections.push({ rowNumber: row.rowNumber, label: masterValue! });
      // A divider ends the record above it.
      active = null;
      push(ImportRowKind.SECTION, null, [`section:${masterValue}`]);
      continue;
    }

    if (hasMaster) {
      active = { masterRowNumber: row.rowNumber, master: row, continuations: [], sectionLabel: currentSection };
      records.push(active);
      push(ImportRowKind.MASTER, row.rowNumber);
      continue;
    }

    // Blank master field: a continuation of the record above, when one is open.
    if (hasAnyValue(row, serviceFields) || Object.values(row.unmapped ?? {}).some((v) => cleanDisplay(v))) {
      if (active) {
        active.continuations.push(row);
        push(ImportRowKind.CONTINUATION, active.masterRowNumber);
      } else {
        const orphan: ClassifiedRow = {
          ...row, kind: ImportRowKind.ORPHAN, masterRowNumber: null,
          notes: ['no active master record to attach to'],
        };
        classified.push(orphan);
        orphans.push(orphan);
      }
      continue;
    }

    // Has content only in unmapped columns and nothing else recognisable.
    void otherFields;
    push(ImportRowKind.BLANK, null, ['only unmapped content']);
  }

  const stats = {
    scanned: sorted.length,
    blank: classified.filter((r) => r.kind === ImportRowKind.BLANK).length,
    banner: classified.filter((r) => r.kind === ImportRowKind.BANNER).length,
    header: classified.filter((r) => r.kind === ImportRowKind.HEADER).length,
    section: classified.filter((r) => r.kind === ImportRowKind.SECTION).length,
    master: classified.filter((r) => r.kind === ImportRowKind.MASTER).length,
    continuation: classified.filter((r) => r.kind === ImportRowKind.CONTINUATION).length,
    orphan: orphans.length,
  };

  return { rows: classified, records, orphans, sections, stats };
}

/**
 * Reconciliation guarantee: every scanned row is accounted for by exactly one
 * classification. Used by the Import Center to prove no row silently vanished.
 */
export function reconcileGrouping(result: GroupingResult): {
  balanced: boolean;
  scanned: number;
  accountedFor: number;
  breakdown: GroupingResult['stats'];
} {
  const s = result.stats;
  const accountedFor = s.blank + s.banner + s.header + s.section + s.master + s.continuation + s.orphan;
  return { balanced: accountedFor === s.scanned, scanned: s.scanned, accountedFor, breakdown: s };
}
