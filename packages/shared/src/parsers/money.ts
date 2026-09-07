import { Currency, ParseStatus, PaymentMethod } from '../domain/enums';
import { cleanDisplay, isEmptyMarker, toAsciiDigits } from './text';

export interface ParsedMoney {
  raw: string | null;
  /** Normalised amount, or null when the value could not be resolved. */
  amount: number | null;
  currency: Currency | null;
  /** Payment method inferred from words such as "credit" in the same cell. */
  method: PaymentMethod | null;
  /** Text left over after the number and currency were removed. */
  residualNote: string | null;
  /** Set when the cell held an expression such as "116000 + 58000". */
  components: number[] | null;
  status: ParseStatus;
  confidence: number;
  warnings: string[];
}

const EMPTY: ParsedMoney = {
  raw: null, amount: null, currency: null, method: null,
  residualNote: null, components: null,
  status: ParseStatus.MISSING, confidence: 0, warnings: [],
};

const CURRENCY_TOKENS: Array<{ test: RegExp; currency: Currency }> = [
  { test: /\b(le|l\.e\.?|egp|eg|جنيه|ج\.م)\b/i, currency: Currency.EGP },
  { test: /\b(usd|us\$|dollars?)\b|\$/i, currency: Currency.USD },
  { test: /\b(eur|euros?)\b|€/i, currency: Currency.EUR },
];

const METHOD_TOKENS: Array<{ test: RegExp; method: PaymentMethod }> = [
  { test: /\bcredit\b|اجل|آجل/i, method: PaymentMethod.CREDIT_NOTE },
  { test: /\bcash\b|نقد|كاش/i, method: PaymentMethod.CASH },
  { test: /\b(transfer|bank|تحويل)\b/i, method: PaymentMethod.BANK_TRANSFER },
  { test: /\b(cheque|check|شيك)\b/i, method: PaymentMethod.CHEQUE },
  { test: /\b(visa|card|بطاقة)\b/i, method: PaymentMethod.CARD },
];

/**
 * Parse a legacy money cell.
 *
 * Never use `parseFloat` on these values: the source contains "23500 LE",
 * "45,900 LE", "3050 credit", "116000 + 58000 LE", "credit" with no number and
 * a stray Arabic letter "د". Everything that is not a clean number must survive
 * as raw text plus a warning, not be truncated to a plausible-looking figure.
 */
export function parseLegacyMoney(input: unknown, defaultCurrency?: Currency): ParsedMoney {
  if (input === null || input === undefined || input === '') return EMPTY;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return { ...EMPTY, raw: String(input), status: ParseStatus.UNPARSEABLE, warnings: ['NON_FINITE_NUMBER'] };
    }
    return {
      raw: String(input), amount: input, currency: defaultCurrency ?? null,
      method: null, residualNote: null, components: null,
      status: ParseStatus.NATIVE, confidence: 1,
      warnings: input < 0 ? ['NEGATIVE_AMOUNT'] : [],
    };
  }

  const raw = String(input);
  const cleaned = cleanDisplay(raw);
  if (cleaned === null) return { ...EMPTY, raw };
  if (isEmptyMarker(cleaned)) {
    return { ...EMPTY, raw, status: ParseStatus.EMPTY_MARKER, confidence: 0 };
  }

  const ascii = toAsciiDigits(cleaned);
  const warnings: string[] = [];

  let currency: Currency | null = null;
  let stripped = ascii;
  for (const c of CURRENCY_TOKENS) {
    if (c.test.test(stripped)) {
      currency = c.currency;
      stripped = stripped.replace(c.test, ' ');
      break;
    }
  }

  let method: PaymentMethod | null = null;
  for (const m of METHOD_TOKENS) {
    if (m.test.test(stripped)) {
      method = m.method;
      stripped = stripped.replace(m.test, ' ');
      break;
    }
  }

  // Numbers, tolerating thousands separators: 45,900 / 45 900 / 45.900,50
  const numberPattern = /-?\d{1,3}(?:[,٬\s]\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  const found: string[] = stripped.match(numberPattern) ?? [];
  const numbers = found
    .map((n) => Number(n.replace(/[,٬\s]/g, '')))
    .filter((n) => Number.isFinite(n));

  const residual = stripped.replace(numberPattern, ' ').replace(/[+\-–—=]/g, ' ').replace(/\s+/g, ' ').trim();
  const residualNote = residual.length ? residual : null;

  if (numbers.length === 0) {
    // Words with no figure at all, e.g. a bare "credit" or a stray letter.
    return {
      raw, amount: null, currency, method,
      residualNote: residualNote ?? ascii, components: null,
      status: ParseStatus.UNPARSEABLE, confidence: 0,
      warnings: [...warnings, method ? 'METHOD_WITHOUT_AMOUNT' : 'NO_NUMERIC_VALUE'],
    };
  }

  if (numbers.length === 1) {
    const amount = numbers[0];
    if (amount < 0) warnings.push('NEGATIVE_AMOUNT');
    if (residualNote) warnings.push('UNEXPECTED_TEXT_IN_MONEY_CELL');
    const confident = !residualNote;
    return {
      raw, amount, currency: currency ?? defaultCurrency ?? null, method,
      residualNote, components: null,
      status: confident ? ParseStatus.PARSED : ParseStatus.AMBIGUOUS,
      confidence: confident ? 0.95 : 0.7,
      warnings,
    };
  }

  // Additive expression, e.g. "116000 + 58000 LE".
  if (/\+/.test(ascii)) {
    const sum = numbers.reduce((a, b) => a + b, 0);
    return {
      raw, amount: sum, currency: currency ?? defaultCurrency ?? null, method,
      residualNote, components: numbers,
      status: ParseStatus.AMBIGUOUS, confidence: 0.7,
      warnings: [...warnings, 'SUM_OF_MULTIPLE_COMPONENTS'],
    };
  }

  // Several unrelated numbers — refuse to pick one.
  return {
    raw, amount: null, currency: currency ?? defaultCurrency ?? null, method,
    residualNote, components: numbers,
    status: ParseStatus.AMBIGUOUS, confidence: 0.2,
    warnings: [...warnings, 'MULTIPLE_AMBIGUOUS_NUMBERS'],
  };
}

/** Round to 2 decimals, avoiding float drift such as 0.1999999999998. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Tolerant equality for reconciliation comparisons. */
export function moneyEquals(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}
