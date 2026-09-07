import { ParseStatus } from '../domain/enums';
import { cleanDisplay, isEmptyMarker, toAsciiDigits } from './text';

export interface ParsedTime {
  raw: string | null;
  /** Minutes since midnight (0..1439), or null when not confidently parsed. */
  minutes: number | null;
  /** "HH:mm" 24-hour rendering of `minutes`. */
  value: string | null;
  status: ParseStatus;
  confidence: number;
  warnings: string[];
}

const EMPTY: ParsedTime = { raw: null, minutes: null, value: null, status: ParseStatus.MISSING, confidence: 0, warnings: [] };

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Descriptive pickup times the operations team typed instead of a clock time.
 * These are mapped to an approximate time and always flagged as ambiguous so a
 * coordinator confirms the real pickup before the day of travel.
 */
const DESCRIPTIVE: Array<{ test: RegExp; minutes: number; label: string }> = [
  { test: /\b(at\s+)?noon\b|الظهر|ظهرا/i, minutes: 12 * 60, label: 'DESCRIPTIVE_NOON' },
  { test: /\bmidnight\b|منتصف\s*الليل/i, minutes: 0, label: 'DESCRIPTIVE_MIDNIGHT' },
  { test: /\b(early\s+)?morning\b|الصباح|صباحا/i, minutes: 8 * 60, label: 'DESCRIPTIVE_MORNING' },
  { test: /\bafternoon\b|بعد\s*الظهر/i, minutes: 15 * 60, label: 'DESCRIPTIVE_AFTERNOON' },
  { test: /\bevening\b|المساء|مساء/i, minutes: 19 * 60, label: 'DESCRIPTIVE_EVENING' },
  { test: /\bnight\b|الليل|ليلا/i, minutes: 21 * 60, label: 'DESCRIPTIVE_NIGHT' },
];

/**
 * Parse a legacy pickup-time cell.
 *
 * Real formats found in the source workbook include native Excel times,
 * `19 : 20`, `9 :30 AM`, `12 : 00 PM`, `22:30 PM` (contradictory), `1900`
 * and free text such as `AT NOON`.
 */
export function parseLegacyTime(input: unknown): ParsedTime {
  if (input === null || input === undefined || input === '') return EMPTY;

  // Native Date carrying a time-of-day (openpyxl `time`, ExcelJS Date).
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { ...EMPTY, raw: String(input), status: ParseStatus.UNPARSEABLE };
    const minutes = input.getUTCHours() * 60 + input.getUTCMinutes();
    return { raw: input.toISOString(), minutes, value: hhmm(minutes), status: ParseStatus.NATIVE, confidence: 1, warnings: [] };
  }

  const raw = String(input);

  if (typeof input === 'number') {
    // Excel stores times as a fraction of a day.
    if (input >= 0 && input < 1) {
      const minutes = Math.round(input * 24 * 60) % 1440;
      return { raw, minutes, value: hhmm(minutes), status: ParseStatus.NATIVE, confidence: 1, warnings: [] };
    }
    // Date+time serial: keep only the fractional part.
    if (input >= 1 && input < 80000) {
      const frac = input - Math.floor(input);
      if (frac > 0) {
        const minutes = Math.round(frac * 24 * 60) % 1440;
        return { raw, minutes, value: hhmm(minutes), status: ParseStatus.PARSED, confidence: 0.9, warnings: ['TIME_FROM_DATETIME_SERIAL'] };
      }
      return { raw, minutes: null, value: null, status: ParseStatus.AMBIGUOUS, confidence: 0, warnings: ['DATE_SERIAL_IN_TIME_COLUMN'] };
    }
    // Bare digits typed as a number, e.g. 1920 meaning 19:20.
    if (Number.isInteger(input) && input >= 0 && input <= 2359) {
      const h = Math.floor(input / 100);
      const m = input % 100;
      if (h <= 23 && m <= 59) {
        return { raw, minutes: h * 60 + m, value: hhmm(h * 60 + m), status: ParseStatus.AMBIGUOUS, confidence: 0.6, warnings: ['BARE_NUMERIC_TIME'] };
      }
    }
    return { raw, minutes: null, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['UNRECOGNISED_NUMERIC_TIME'] };
  }

  const cleaned = cleanDisplay(raw);
  if (cleaned === null) return { ...EMPTY, raw };
  if (isEmptyMarker(cleaned)) return { raw, minutes: null, value: null, status: ParseStatus.EMPTY_MARKER, confidence: 0, warnings: [] };

  const ascii = toAsciiDigits(cleaned);
  const warnings: string[] = [];

  // Meridiem markers, including the Arabic ص / م.
  const hasAm = /\bam\b|\ba\.m\.?/i.test(ascii) || /\bص\b/.test(ascii);
  const hasPm = /\bpm\b|\bp\.m\.?/i.test(ascii) || /\bم\b/.test(ascii);

  // Tolerates stray spaces and a mistyped separator: "19 : 20", "9 :30",
  // "13;10" (semicolon sits next to the colon on the keyboard).
  const m = ascii.match(/(\d{1,2})\s*[:;.\s]\s*(\d{2})/);
  if (m) {
    let h = +m[1];
    const min = +m[2];
    if (min > 59) return { raw, minutes: null, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['INVALID_MINUTES'] };
    let confidence = 0.95;
    if (hasPm) {
      if (h > 12) {
        // "22:30 PM" — the 24-hour reading is kept, the contradiction recorded.
        warnings.push('CONTRADICTORY_MERIDIEM');
        confidence = 0.75;
      } else if (h < 12) {
        h += 12;
      }
    } else if (hasAm) {
      if (h === 12) h = 0;
      else if (h > 12) { warnings.push('CONTRADICTORY_MERIDIEM'); confidence = 0.75; }
    } else if (h <= 12) {
      // No meridiem on a 1-12 hour: taken literally as 24-hour clock.
      warnings.push('NO_MERIDIEM_ASSUMED_24H');
      confidence = 0.8;
    }
    if (h > 23) return { raw, minutes: null, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['INVALID_HOURS'] };
    const minutes = h * 60 + min;
    const status = warnings.length ? ParseStatus.AMBIGUOUS : ParseStatus.PARSED;
    return { raw, minutes, value: hhmm(minutes), status, confidence, warnings };
  }

  // Hour only with a meridiem: "7 PM", "9 AM".
  const hOnly = ascii.match(/^(\d{1,2})\s*(am|pm|ص|م)?$/i);
  if (hOnly) {
    let h = +hOnly[1];
    if (h > 23) return { raw, minutes: null, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['INVALID_HOURS'] };
    if (hasPm && h < 12) h += 12;
    if (hasAm && h === 12) h = 0;
    const minutes = h * 60;
    return {
      raw, minutes, value: hhmm(minutes),
      status: ParseStatus.AMBIGUOUS,
      confidence: hasAm || hasPm ? 0.75 : 0.5,
      warnings: hasAm || hasPm ? ['HOUR_ONLY'] : ['HOUR_ONLY', 'NO_MERIDIEM_ASSUMED_24H'],
    };
  }

  for (const d of DESCRIPTIVE) {
    if (d.test.test(ascii)) {
      return { raw, minutes: d.minutes, value: hhmm(d.minutes), status: ParseStatus.AMBIGUOUS, confidence: 0.4, warnings: [d.label, 'APPROXIMATE_TIME'] };
    }
  }

  return { raw, minutes: null, value: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['UNRECOGNISED_TIME_FORMAT'] };
}
