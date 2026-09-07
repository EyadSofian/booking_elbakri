import ExcelJS from 'exceljs';
import { cleanDisplay, normalizeForSearch, type RawRow } from '@elbakri/shared';
import { SHEET_PROFILES, type SheetKind, type SheetProfile } from './sheet-profiles';

export interface SheetScan {
  sheetName: string;
  detectedKind: SheetKind;
  profile: SheetProfile | null;
  headerRow: number | null;
  maxRow: number;
  maxColumn: number;
  isEmpty: boolean;
  /** Column letter -> logical field, for the columns this profile maps. */
  columnMapping: Record<string, string>;
  /** Columns holding data that no profile column claims. Never discarded. */
  unmappedColumns: string[];
  rows: RawRow[];
  /** Non-empty rows above the header row. */
  bannerRows: number[];
}

export interface WorkbookScan {
  filename: string;
  sheets: SheetScan[];
}

/** Excel column letters ("A", "AB") to a 1-based index. */
export function columnToIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToColumn(index: number): string {
  let s = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Reads an .xlsx workbook into logical rows.
 *
 * Two behaviours matter for these files:
 *
 * 1. The sheets are heavily merged — a single record often occupies two
 *    physical rows. Only the merge anchor carries the value, so a value is read
 *    at its anchor and the covered cells are left empty. That keeps one record
 *    as one logical row instead of duplicating it down the merge.
 * 2. Nothing is dropped. Columns that no profile claims are collected into
 *    `unmapped` and travel with the row all the way into `import_rows`.
 */
export class WorkbookReader {
  /** Reads a workbook from a buffer and classifies every worksheet. */
  static async scan(buffer: Buffer, filename: string): Promise<WorkbookScan> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheets: SheetScan[] = [];
    for (const ws of wb.worksheets) {
      sheets.push(WorkbookReader.scanSheet(ws));
    }
    return { filename, sheets };
  }

  private static scanSheet(ws: ExcelJS.Worksheet): SheetScan {
    const maxRow = ws.rowCount ?? 0;
    const maxColumn = ws.columnCount ?? 0;

    // Cells covered by a merge but not its anchor.
    const covered = WorkbookReader.coveredCells(ws);

    const detection = WorkbookReader.detectProfile(ws, maxRow, covered);
    const profile = detection.profile;
    const headerRow = detection.headerRow;

    const columnMapping: Record<string, string> = {};
    const mappedIndexes = new Map<number, string>();
    if (profile) {
      for (const spec of profile.columns) {
        const idx = detection.columnOverrides[spec.field] ?? columnToIndex(spec.column);
        columnMapping[indexToColumn(idx)] = spec.field;
        mappedIndexes.set(idx, spec.field);
      }
    }

    const rows: RawRow[] = [];
    const bannerRows: number[] = [];
    const unmappedSeen = new Set<string>();
    let anyContent = false;

    for (let r = 1; r <= maxRow; r++) {
      const values: Record<string, unknown> = {};
      const unmapped: Record<string, unknown> = {};
      let rowHasContent = false;

      for (let c = 1; c <= maxColumn; c++) {
        if (covered.has(`${r}:${c}`)) continue;
        const raw = WorkbookReader.cellValue(ws.getCell(r, c));
        if (raw === null) continue;
        rowHasContent = true;
        anyContent = true;

        const field = mappedIndexes.get(c);
        if (field) {
          values[field] = raw;
        } else {
          const letter = indexToColumn(c);
          unmapped[letter] = raw;
          unmappedSeen.add(letter);
        }
      }

      if (!rowHasContent) {
        rows.push({ rowNumber: r, values: {}, unmapped: {} });
        continue;
      }
      if (headerRow !== null && r < headerRow) bannerRows.push(r);
      rows.push({ rowNumber: r, values, unmapped });
    }

    return {
      sheetName: ws.name,
      detectedKind: profile?.kind ?? (anyContent ? 'UNKNOWN' : 'EMPTY'),
      profile,
      headerRow,
      maxRow,
      maxColumn,
      isEmpty: !anyContent,
      columnMapping,
      unmappedColumns: [...unmappedSeen].sort(),
      rows,
      bannerRows,
    };
  }

  /** Set of "row:col" keys covered by a merge but not holding its value. */
  private static coveredCells(ws: ExcelJS.Worksheet): Set<string> {
    const covered = new Set<string>();
    // ExcelJS exposes merges as an internal map of ranges.
    const merges = (ws as unknown as { _merges?: Record<string, { top: number; left: number; bottom: number; right: number }> })._merges;
    if (!merges) return covered;
    for (const range of Object.values(merges)) {
      for (let r = range.top; r <= range.bottom; r++) {
        for (let c = range.left; c <= range.right; c++) {
          if (r === range.top && c === range.left) continue;
          covered.add(`${r}:${c}`);
        }
      }
    }
    return covered;
  }

  /**
   * Normalises a cell to a primitive.
   *
   * Formula cells yield their cached result; rich text is flattened; hyperlinks
   * keep their display text. Blank-looking strings become null so they are not
   * mistaken for data.
   */
  private static cellValue(cell: ExcelJS.Cell): unknown {
    const v = cell.value;
    if (v === null || v === undefined) return null;

    if (v instanceof Date) return v;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return cleanDisplay(v);

    if (typeof v === 'object') {
      const obj = v as unknown as Record<string, unknown>;
      if ('result' in obj) {
        const result = obj.result;
        if (result === null || result === undefined) return null;
        if (result instanceof Date || typeof result === 'number') return result;
        return cleanDisplay(String(result));
      }
      if ('richText' in obj && Array.isArray(obj.richText)) {
        const text = (obj.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('');
        return cleanDisplay(text);
      }
      if ('text' in obj) return cleanDisplay(String(obj.text));
      if ('hyperlink' in obj) return cleanDisplay(String(obj.hyperlink));
      if ('error' in obj) return `#${String(obj.error)}`;
    }
    return cleanDisplay(String(v));
  }

  /**
   * Identifies the layout by looking for a row whose cells match a profile's
   * expected headers, rather than trusting a fixed row number.
   */
  private static detectProfile(
    ws: ExcelJS.Worksheet,
    maxRow: number,
    covered: Set<string>,
  ): { profile: SheetProfile | null; headerRow: number | null; columnOverrides: Record<string, number> } {
    const sheetKey = normalizeForSearch(ws.name);
    const searchLimit = Math.min(maxRow, 30);

    let best: { profile: SheetProfile; headerRow: number; overrides: Record<string, number>; score: number } | null = null;

    for (const profile of SHEET_PROFILES) {
      const expected = profile.columns.filter((c) => c.header);
      if (!expected.length) continue;

      for (let r = 1; r <= searchLimit; r++) {
        const overrides: Record<string, number> = {};
        let matched = 0;

        for (const spec of expected) {
          const wanted = normalizeForSearch(spec.header);
          // Look at the expected column first, then anywhere on the row.
          const expectedIdx = columnToIndex(spec.column);
          const atExpected = normalizeForSearch(String(ws.getCell(r, expectedIdx).value ?? ''));
          if (atExpected === wanted) {
            matched++;
            overrides[spec.field] = expectedIdx;
            continue;
          }
          for (let c = 1; c <= Math.min(ws.columnCount ?? 0, 40); c++) {
            if (covered.has(`${r}:${c}`)) continue;
            if (normalizeForSearch(String(ws.getCell(r, c).value ?? '')) === wanted) {
              matched++;
              overrides[spec.field] = c;
              break;
            }
          }
        }

        const score = matched / expected.length;
        // Require most headers to line up before claiming a layout.
        if (score >= 0.7 && (!best || score > best.score)) {
          best = { profile, headerRow: r, overrides, score };
        }
      }
    }

    if (best) return { profile: best.profile, headerRow: best.headerRow, columnOverrides: best.overrides };

    // No header row matched. Fall back to the sheet name only when it is
    // unambiguous — the SAMA settlement sheet has no headers at all.
    const byName = SHEET_PROFILES.find((p) => p.sheetNameHints.includes(sheetKey));
    if (byName && byName.kind === 'PARTNER_SETTLEMENT') {
      return { profile: byName, headerRow: byName.defaultHeaderRow, columnOverrides: {} };
    }

    return { profile: null, headerRow: null, columnOverrides: {} };
  }
}
