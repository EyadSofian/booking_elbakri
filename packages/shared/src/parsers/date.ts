import { ParseStatus } from '../domain/enums';
import { cleanDisplay, isEmptyMarker, toAsciiDigits } from './text';

export interface ParsedDate {
  /** Exact original cell value, stringified. Never discarded. */
  raw: string | null;
  /** UTC midnight of the calendar date, or null when not confidently parsed. */
  value: Date | null;
  status: ParseStatus;
  /** 0..1 — how confident the interpretation is. */
  confidence: number;
  /** Machine-readable notes, e.g. `SUSPICIOUS_YEAR`, `ASSUMED_YEAR`. */
  warnings: string[];
}

/** Years outside this window are almost certainly typing mistakes. */
export const MIN_PLAUSIBLE_YEAR = 2015;
export const MAX_PLAUSIBLE_YEAR = 2035;

const EN_MONTHS: Record<string, number> = {
  jan: 1, january: 1, janury: 1, janaury: 1,
  feb: 2, february: 2, febuary: 2, feburary: 2,
  mar: 3, march: 3, marc: 3,
  apr: 4, april: 4, apirl: 4, aprl: 4,
  may: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, jully: 7, juley: 7,
  aug: 8, august: 8, augest: 8, auguest: 8, augast: 8, agust: 8, augst: 8,
  sep: 9, sept: 9, september: 9, septamber: 9, septmber: 9,
  oct: 10, october: 10, octuber: 10, ocotber: 10,
  nov: 11, november: 11, novamber: 11, novmber: 11,
  dec: 12, december: 12, decamber: 12, decmber: 12,
};

/** Arabic month names, both Levantine and Egyptian conventions. */
const AR_MONTHS: Record<string, number> = {
  'يناير': 1, 'كانون الثاني': 1,
  'فبراير': 2, 'شباط': 2,
  'مارس': 3, 'اذار': 3, 'آذار': 3,
  'ابريل': 4, 'أبريل': 4, 'نيسان': 4,
  'مايو': 5, 'ايار': 5, 'أيار': 5,
  'يونيو': 6, 'يونية': 6, 'حزيران': 6,
  'يوليو': 7, 'يولية': 7, 'تموز': 7,
  'اغسطس': 8, 'أغسطس': 8, 'اب': 8, 'آب': 8,
  'سبتمبر': 9, 'ايلول': 9, 'أيلول': 9,
  'اكتوبر': 10, 'أكتوبر': 10, 'تشرين الاول': 10,
  'نوفمبر': 11, 'تشرين الثاني': 11,
  'ديسمبر': 12, 'كانون الاول': 12,
};

/** Explicit escapes - see the note on ARABIC_DIACRITICS in `text.ts`. */
const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function stripArabicDiacritics(s: string): string {
  return s
    .replace(ARABIC_MARKS, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A');
}

function utcDate(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject rolled-over dates such as 31 April -> 1 May.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

function yearWarnings(d: Date): string[] {
  const y = d.getUTCFullYear();
  return y < MIN_PLAUSIBLE_YEAR || y > MAX_PLAUSIBLE_YEAR ? ['SUSPICIOUS_YEAR'] : [];
}

/**
 * Convert an Excel serial number to a UTC date.
 * Accounts for the deliberate 1900 leap-year bug in the Excel epoch.
 */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 80000) return null;
  // Serial 60 is Excel's non-existent 29-Feb-1900.
  const adjusted = serial < 60 ? serial + 1 : serial;
  const ms = Math.round((adjusted - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface ParseDateOptions {
  /**
   * Year assumed when the source text omits it (e.g. "22 يوليو").
   * Supplying it downgrades confidence and records an `ASSUMED_YEAR` warning
   * rather than silently inventing a date.
   */
  assumeYear?: number;
  /** Prefer D/M/Y over M/D/Y for ambiguous numeric dates. Default true (Egypt). */
  dayFirst?: boolean;
}

/**
 * Parse a legacy date cell.
 *
 * Ambiguity is never silently resolved: an unrecognised value yields
 * `UNPARSEABLE` with the raw text intact, so the Import Center can surface it.
 */
export function parseLegacyDate(input: unknown, opts: ParseDateOptions = {}): ParsedDate {
  const dayFirst = opts.dayFirst ?? true;
  const base: ParsedDate = { raw: null, value: null, status: ParseStatus.MISSING, confidence: 0, warnings: [] };

  if (input === null || input === undefined || input === '') return base;

  // Native Date from the workbook reader — the most trustworthy case.
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return { ...base, raw: String(input), status: ParseStatus.UNPARSEABLE };
    }
    const v = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
    return { raw: input.toISOString(), value: v, status: ParseStatus.NATIVE, confidence: 1, warnings: yearWarnings(v) };
  }

  const raw = String(input);

  if (typeof input === 'number') {
    if (input === 0) {
      // Excel serial 0 is not a real date; operators used it as "blank".
      return { raw, value: null, status: ParseStatus.EMPTY_MARKER, confidence: 0, warnings: ['ZERO_SERIAL'] };
    }
    const v = excelSerialToDate(input);
    if (!v) return { raw, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['OUT_OF_RANGE_SERIAL'] };
    return { raw, value: v, status: ParseStatus.NATIVE, confidence: 1, warnings: yearWarnings(v) };
  }

  const cleaned = cleanDisplay(raw);
  if (cleaned === null) return { ...base, raw };
  if (isEmptyMarker(cleaned)) {
    return { raw, value: null, status: ParseStatus.EMPTY_MARKER, confidence: 0, warnings: [] };
  }

  // Multiple dates in one cell, e.g. "3 april, 8 april" — do not guess which.
  if (/[,،]|\band\b|\+/.test(cleaned) && /\d/.test(cleaned)) {
    const segments = cleaned.split(/[,،+]|\band\b/).map((s) => s.trim()).filter(Boolean);
    if (segments.length > 1) {
      return { raw, value: null, status: ParseStatus.AMBIGUOUS, confidence: 0, warnings: ['MULTIPLE_DATES_IN_ONE_CELL'] };
    }
  }

  const ascii = toAsciiDigits(cleaned);

  // ISO: 2025-07-22
  const iso = ascii.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const v = utcDate(+iso[1], +iso[2], +iso[3]);
    if (v) return { raw, value: v, status: ParseStatus.PARSED, confidence: 0.98, warnings: yearWarnings(v) };
    return { raw, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['IMPOSSIBLE_CALENDAR_DATE'] };
  }

  // Numeric: 22/7/2025, 22-07-25, 7/22/2025
  const num = ascii.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (num) {
    const a = +num[1];
    const b = +num[2];
    let year = num[3] ? +num[3] : opts.assumeYear;
    const warnings: string[] = [];
    if (!num[3]) {
      if (year === undefined) {
        return { raw, value: null, status: ParseStatus.AMBIGUOUS, confidence: 0, warnings: ['MISSING_YEAR'] };
      }
      warnings.push('ASSUMED_YEAR');
    } else if (num[3].length === 2) {
      year = 2000 + year!;
      warnings.push('TWO_DIGIT_YEAR');
    }
    let day = dayFirst ? a : b;
    let month = dayFirst ? b : a;
    let confidence = 0.9;
    if (a > 12 && b <= 12) { day = a; month = b; confidence = 0.95; }
    else if (b > 12 && a <= 12) { day = b; month = a; confidence = 0.95; }
    else if (a <= 12 && b <= 12) { warnings.push('AMBIGUOUS_DAY_MONTH'); confidence = 0.6; }
    const v = utcDate(year!, month, day);
    if (!v) return { raw, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: [...warnings, 'IMPOSSIBLE_CALENDAR_DATE'] };
    const status = warnings.includes('AMBIGUOUS_DAY_MONTH') || warnings.includes('ASSUMED_YEAR')
      ? ParseStatus.AMBIGUOUS : ParseStatus.PARSED;
    return { raw, value: v, status, confidence, warnings: [...warnings, ...yearWarnings(v)] };
  }

  // Textual: "22 يوليو", "31 auguest", "7 AUGAST 2025", "August 7"
  const folded = stripArabicDiacritics(ascii).toLowerCase();
  const monthNames = { ...EN_MONTHS, ...AR_MONTHS };
  let matchedMonth: number | null = null;
  let matchedToken = '';
  for (const [name, m] of Object.entries(monthNames)) {
    if (name.length < 3) continue;
    if (folded.includes(name) && name.length > matchedToken.length) {
      matchedMonth = m;
      matchedToken = name;
    }
  }
  if (matchedMonth !== null) {
    const rest = folded.replace(matchedToken, ' ');
    const nums: string[] = rest.match(/\d+/g) ?? [];
    const dayCandidate = nums.map(Number).find((n) => n >= 1 && n <= 31);
    const yearCandidate = nums.map(Number).find((n) => n >= 1900);
    const warnings: string[] = [];
    if (dayCandidate === undefined) {
      return { raw, value: null, status: ParseStatus.AMBIGUOUS, confidence: 0, warnings: ['MONTH_WITHOUT_DAY'] };
    }
    let year = yearCandidate;
    if (year === undefined) {
      if (opts.assumeYear === undefined) {
        return { raw, value: null, status: ParseStatus.AMBIGUOUS, confidence: 0.3, warnings: ['MISSING_YEAR'] };
      }
      year = opts.assumeYear;
      warnings.push('ASSUMED_YEAR');
    }
    const v = utcDate(year, matchedMonth, dayCandidate);
    if (!v) {
      // e.g. "31 april" — a real legacy value that is not a real calendar date.
      return { raw, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: [...warnings, 'IMPOSSIBLE_CALENDAR_DATE'] };
    }
    const status = warnings.length ? ParseStatus.AMBIGUOUS : ParseStatus.PARSED;
    return { raw, value: v, status, confidence: warnings.length ? 0.65 : 0.9, warnings: [...warnings, ...yearWarnings(v)] };
  }

  return { raw, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['UNRECOGNISED_DATE_FORMAT'] };
}

/** Whole days between two calendar dates. Negative when out of order. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const a = Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate());
  const b = Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate());
  return Math.round((b - a) / 86400000);
}
