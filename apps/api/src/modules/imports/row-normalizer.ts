import {
  DataQualityCategory, DataQualitySeverity, ParseStatus,
  parseLegacyCount, parseLegacyDate, parseLegacyMoney, parseLegacyPhone, parseLegacyTime,
  type ParsedCount, type ParsedDate, type ParsedMoney, type ParsedPhone, type ParsedTime,
  cleanDisplay, type RawRow,
} from '@elbakri/shared';
import { KIND_TO_ISSUE_CATEGORY, type ColumnSpec, type SheetProfile } from './sheet-profiles';

export interface FieldIssue {
  field: string;
  category: DataQualityCategory;
  severity: DataQualitySeverity;
  rawValue: string | null;
  message: string;
  details?: Record<string, unknown>;
}

export type NormalizedValue =
  | ({ kind: 'date' } & ParsedDate)
  | ({ kind: 'time' } & ParsedTime)
  | ({ kind: 'money' } & ParsedMoney)
  | ({ kind: 'count' } & ParsedCount)
  | ({ kind: 'phone' } & ParsedPhone)
  | { kind: 'text'; raw: string | null; value: string | null; status: ParseStatus };

export interface NormalizedRow {
  rowNumber: number;
  fields: Record<string, NormalizedValue>;
  issues: FieldIssue[];
  unmapped: Record<string, unknown>;
}

/**
 * A parse status that is not clean enough to use without a human looking at it.
 */
function needsReview(status: ParseStatus): boolean {
  return status === ParseStatus.AMBIGUOUS || status === ParseStatus.UNPARSEABLE;
}

function severityFor(status: ParseStatus): DataQualitySeverity {
  if (status === ParseStatus.UNPARSEABLE) return DataQualitySeverity.ERROR;
  if (status === ParseStatus.AMBIGUOUS) return DataQualitySeverity.WARNING;
  return DataQualitySeverity.INFO;
}

/**
 * Applies the right parser to every mapped column and collects the resulting
 * issues.
 *
 * Nothing here rewrites a source value. A cell that cannot be understood keeps
 * its raw text, gets a null normalised value and produces an issue — the record
 * still imports, but the ambiguity stays visible instead of being papered over
 * with a plausible guess.
 */
export function normalizeRow(
  row: RawRow,
  profile: SheetProfile,
  opts: { assumeYear?: number } = {},
): NormalizedRow {
  const fields: Record<string, NormalizedValue> = {};
  const issues: FieldIssue[] = [];

  for (const spec of profile.columns) {
    const raw = row.values[spec.field];
    if (raw === undefined) continue;

    const normalized = normalizeField(spec, raw, opts);
    fields[spec.field] = normalized;

    if (needsReview(normalized.status)) {
      issues.push({
        field: spec.field,
        category: KIND_TO_ISSUE_CATEGORY[spec.kind],
        severity: severityFor(normalized.status),
        rawValue: normalized.raw,
        message: describeIssue(spec, normalized),
        details: { warnings: 'warnings' in normalized ? normalized.warnings : [], parseStatus: normalized.status },
      });
    }
  }

  // Values in columns no profile claims are preserved and surfaced, so a
  // column added to the workbook later cannot slip through unnoticed.
  const unmapped = row.unmapped ?? {};
  for (const [letter, value] of Object.entries(unmapped)) {
    issues.push({
      field: `column_${letter}`,
      category: DataQualityCategory.UNKNOWN_LEGACY_COLUMN,
      severity: DataQualitySeverity.INFO,
      rawValue: cleanDisplay(value),
      message: `Column ${letter} holds a value that this layout does not map. It has been preserved on the imported row.`,
      details: { column: letter },
    });
  }

  return { rowNumber: row.rowNumber, fields, issues, unmapped };
}

function normalizeField(
  spec: ColumnSpec,
  raw: unknown,
  opts: { assumeYear?: number },
): NormalizedValue {
  switch (spec.kind) {
    case 'date':
      return { kind: 'date', ...parseLegacyDate(raw, { assumeYear: opts.assumeYear }) };
    case 'time':
      return { kind: 'time', ...parseLegacyTime(raw) };
    case 'money':
      return { kind: 'money', ...parseLegacyMoney(raw) };
    case 'count':
      return { kind: 'count', ...parseLegacyCount(raw) };
    case 'phone':
      return { kind: 'phone', ...parseLegacyPhone(raw) };
    case 'text':
    default: {
      const value = cleanDisplay(raw);
      return {
        kind: 'text',
        raw: raw === null || raw === undefined ? null : String(raw),
        value,
        status: value === null ? ParseStatus.MISSING : ParseStatus.NATIVE,
      };
    }
  }
}

function describeIssue(spec: ColumnSpec, value: NormalizedValue): string {
  const label = spec.header || spec.field;
  const raw = value.raw ?? '';
  const warnings = 'warnings' in value ? value.warnings : [];

  if (value.status === ParseStatus.UNPARSEABLE) {
    return `${label}: "${raw}" could not be interpreted as a ${spec.kind} value. The original text has been kept for review.`;
  }
  const detail = warnings.length ? ` (${warnings.join(', ')})` : '';
  return `${label}: "${raw}" was interpreted with low confidence${detail}. Please confirm.`;
}

/** Convenience accessors that keep call sites free of type narrowing noise. */
export function dateOf(row: NormalizedRow, field: string): Date | null {
  const v = row.fields[field];
  return v && v.kind === 'date' ? v.value : null;
}
export function textOf(row: NormalizedRow, field: string): string | null {
  const v = row.fields[field];
  if (!v) return null;
  if (v.kind === 'text') return v.value;
  return v.raw;
}
export function rawOf(row: NormalizedRow, field: string): string | null {
  return row.fields[field]?.raw ?? null;
}
export function countOf(row: NormalizedRow, field: string): number | null {
  const v = row.fields[field];
  return v && v.kind === 'count' ? v.value : null;
}
export function moneyOf(row: NormalizedRow, field: string): ParsedMoney | null {
  const v = row.fields[field];
  return v && v.kind === 'money' ? v : null;
}
export function phoneOf(row: NormalizedRow, field: string): ParsedPhone | null {
  const v = row.fields[field];
  return v && v.kind === 'phone' ? v : null;
}
export function timeOf(row: NormalizedRow, field: string): ParsedTime | null {
  const v = row.fields[field];
  return v && v.kind === 'time' ? v : null;
}
