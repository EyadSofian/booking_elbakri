import { ParseStatus } from '../domain/enums';
import { cleanDisplay, isEmptyMarker, toAsciiDigits } from './text';

export interface ParsedPhone {
  raw: string | null;
  /** E.164 form (`+201002998299`) when confidently derivable. */
  normalized: string | null;
  countryCallingCode: string | null;
  /** Digits only, leading zeros preserved. */
  digits: string | null;
  status: ParseStatus;
  confidence: number;
  warnings: string[];
}

const EMPTY: ParsedPhone = {
  raw: null, normalized: null, countryCallingCode: null, digits: null,
  status: ParseStatus.MISSING, confidence: 0, warnings: [],
};

/**
 * Calling codes seen in the source data, longest-first so that `961` is tested
 * before `96` would ever be considered.
 */
const CALLING_CODES = ['966', '971', '974', '973', '968', '965', '962', '964', '961', '963', '970', '249', '218', '216', '213', '212', '20', '90', '86', '49', '44', '39', '34', '33', '1'];

/** National mobile prefixes used to recognise a local number missing its code. */
const LOCAL_HINTS: Array<{ code: string; test: RegExp; length: number }> = [
  { code: '20', test: /^01[0125]\d{8}$/, length: 11 },   // Egypt mobile
  { code: '961', test: /^(3|7[01)]|8[01]|76|78|79|81)\d{6}$/, length: 8 }, // Lebanon mobile
];

/**
 * Parse a legacy phone cell.
 *
 * Legacy sheets stored phones as floating-point numbers, which silently
 * destroyed leading zeros and rendered long numbers in exponential form. The
 * raw value is always preserved; normalisation only happens when a country
 * calling code can be identified without guessing.
 */
export function parseLegacyPhone(input: unknown): ParsedPhone {
  if (input === null || input === undefined || input === '') return EMPTY;

  const warnings: string[] = [];
  let raw: string;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ...EMPTY, raw: String(input), status: ParseStatus.UNPARSEABLE };
    // Render without exponent or decimal point; Excel stored these as floats.
    raw = Number.isInteger(input) ? BigInt(Math.round(input)).toString() : String(input);
    warnings.push('STORED_AS_NUMBER_LEADING_ZEROS_MAY_BE_LOST');
  } else {
    raw = String(input);
  }

  const cleaned = cleanDisplay(raw);
  if (cleaned === null) return { ...EMPTY, raw };
  if (isEmptyMarker(cleaned)) return { ...EMPTY, raw, status: ParseStatus.EMPTY_MARKER };

  const ascii = toAsciiDigits(cleaned);
  const hasPlus = ascii.trimStart().startsWith('+') || ascii.startsWith('00');
  let digits = ascii.replace(/\D/g, '');

  if (!digits) {
    return { raw, normalized: null, countryCallingCode: null, digits: null, status: ParseStatus.UNPARSEABLE, confidence: 0, warnings: [...warnings, 'NO_DIGITS'] };
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    warnings.push('INTERNATIONAL_00_PREFIX');
  }

  // Local number that never had its country code — recognisable by shape.
  for (const hint of LOCAL_HINTS) {
    if (hint.test.test(digits)) {
      const normalized = `+${hint.code}${digits.replace(/^0/, '')}`;
      return {
        raw, normalized, countryCallingCode: hint.code, digits,
        status: ParseStatus.AMBIGUOUS, confidence: 0.7,
        warnings: [...warnings, 'ASSUMED_COUNTRY_FROM_LOCAL_FORMAT'],
      };
    }
  }

  // Egyptian mobile whose leading zero was eaten by the float conversion.
  if (/^1[0125]\d{8}$/.test(digits)) {
    return {
      raw, normalized: `+20${digits}`, countryCallingCode: '20', digits: `0${digits}`,
      status: ParseStatus.AMBIGUOUS, confidence: 0.65,
      warnings: [...warnings, 'RESTORED_LEADING_ZERO_EGYPT', 'ASSUMED_COUNTRY_FROM_LOCAL_FORMAT'],
    };
  }

  const code = CALLING_CODES.find((c) => digits.startsWith(c));
  if (code) {
    const rest = digits.slice(code.length);
    const plausible = rest.length >= 6 && rest.length <= 12;
    return {
      raw, normalized: plausible ? `+${digits}` : null,
      countryCallingCode: plausible ? code : null, digits,
      status: plausible ? (hasPlus ? ParseStatus.PARSED : ParseStatus.AMBIGUOUS) : ParseStatus.AMBIGUOUS,
      confidence: plausible ? (hasPlus ? 0.95 : 0.85) : 0.3,
      warnings: plausible ? warnings : [...warnings, 'IMPLAUSIBLE_LENGTH_FOR_COUNTRY_CODE'],
    };
  }

  return {
    raw, normalized: null, countryCallingCode: null, digits,
    status: ParseStatus.AMBIGUOUS, confidence: 0.3,
    warnings: [...warnings, 'UNRECOGNISED_COUNTRY_CODE'],
  };
}
