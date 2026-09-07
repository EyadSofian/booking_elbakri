import { ParseStatus } from '../domain/enums';
import { cleanDisplay, isEmptyMarker, toAsciiDigits } from './text';

export interface ParsedCount {
  raw: string | null;
  value: number | null;
  /** Text alongside the figure, e.g. "with child" in "3 with child". */
  residualNote: string | null;
  status: ParseStatus;
  confidence: number;
  warnings: string[];
}

const EMPTY: ParsedCount = {
  raw: null, value: null, residualNote: null,
  status: ParseStatus.MISSING, confidence: 0, warnings: [],
};

/** Parse a passenger / child count cell, preserving any qualifying text. */
export function parseLegacyCount(input: unknown): ParsedCount {
  if (input === null || input === undefined || input === '') return EMPTY;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ...EMPTY, raw: String(input), status: ParseStatus.UNPARSEABLE };
    const isWhole = Number.isInteger(input);
    return {
      raw: String(input), value: isWhole ? input : Math.round(input), residualNote: null,
      status: isWhole ? ParseStatus.NATIVE : ParseStatus.AMBIGUOUS,
      confidence: isWhole ? 1 : 0.6,
      warnings: [
        ...(isWhole ? [] : ['NON_INTEGER_COUNT_ROUNDED']),
        ...(input < 0 ? ['NEGATIVE_COUNT'] : []),
      ],
    };
  }

  const raw = String(input);
  const cleaned = cleanDisplay(raw);
  if (cleaned === null) return { ...EMPTY, raw };
  if (isEmptyMarker(cleaned)) return { ...EMPTY, raw, status: ParseStatus.EMPTY_MARKER };

  const ascii = toAsciiDigits(cleaned);
  // Annotated explicitly: `match() ?? []` is `RegExpMatchArray | never[]`,
  // a union that makes later array methods resolve to the wrong overload.
  const nums: string[] = ascii.match(/\d+/g) ?? [];
  const residual = ascii.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim() || null;

  if (nums.length === 0) {
    return { raw, value: null, residualNote: residual, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: ['NO_NUMERIC_VALUE'] };
  }
  if (nums.length === 1) {
    return {
      raw, value: Number(nums[0]), residualNote: residual,
      status: residual ? ParseStatus.AMBIGUOUS : ParseStatus.PARSED,
      confidence: residual ? 0.75 : 0.95,
      warnings: residual ? ['QUALIFYING_TEXT_WITH_COUNT'] : [],
    };
  }
  // "2 + 1" style entries are summed, but the components stay visible via raw.
  if (/\+/.test(ascii)) {
    return {
      raw, value: nums.reduce((sum, n) => sum + Number(n), 0), residualNote: residual,
      status: ParseStatus.AMBIGUOUS, confidence: 0.6, warnings: ['SUM_OF_MULTIPLE_COUNTS'],
    };
  }
  return { raw, value: null, residualNote: residual, status: ParseStatus.AMBIGUOUS, confidence: 0.2, warnings: ['MULTIPLE_AMBIGUOUS_NUMBERS'] };
}
