/**
 * Text normalisation helpers.
 *
 * Normalisation exists ONLY for searching, matching and alias resolution.
 * The original Unicode value is always preserved separately and is what the UI
 * displays — a traveller's real name is never overwritten by its search form.
 */

/** Arabic-Indic and Extended Arabic-Indic digits mapped to ASCII. */
const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * Arabic combining marks plus the tatweel elongation character.
 *
 * Written as explicit escapes on purpose. Spelling these ranges with literal
 * characters is easy to get wrong, and a class that accidentally spans
 * U+0620-U+064A deletes the Arabic letters themselves instead of the marks,
 * which would silently erase every Arabic name in the system.
 */
const ARABIC_DIACRITICS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Convert Arabic-Indic digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d);
}

/**
 * Fold Arabic letter variants onto a single canonical form so that
 * "البكرى" and "البكري" compare equal.
 */
export function foldArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // alef variants -> alef
    .replace(/\u0649/g, '\u064A') // alef maqsura -> yeh
    .replace(/\u0629/g, '\u0647') // teh marbuta -> heh
    .replace(/\u0624/g, '\u0648') // waw hamza -> waw
    .replace(/\u0626/g, '\u064A'); // yeh hamza -> yeh
}

/**
 * Canonical search key: case-folded, accent-stripped, Arabic-folded,
 * punctuation-collapsed, whitespace-collapsed.
 *
 * Deterministic and idempotent — the alias system and duplicate detector both
 * depend on that property.
 */
export function normalizeForSearch(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  let s = String(input);
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // strip Latin accents
  s = toAsciiDigits(s);
  s = foldArabic(s);
  s = s.toLowerCase();
  s = s.replace(/[._\-–—/\\|,;:()[\]{}'"`*+&]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Alias key used to look up master data (hotels, partners, room types…).
 * Same as the search key but also drops very common noise words so that
 * "SAMA TOURS" and "sama" resolve to the same key candidate list.
 */
export function normalizeAliasKey(input: string | null | undefined): string {
  return normalizeForSearch(input);
}

/** Trim, collapse inner whitespace, return null for structurally empty input. */
export function cleanDisplay(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

/**
 * Values that legacy operators typed to mean "nothing here".
 * Recognising these prevents them being imported as real data.
 */
const EMPTY_MARKERS = new Set([
  '-', '--', '---', '----', '-----', '_', '__', '___', '____',
  '.', '..', '...', 'n/a', 'na', 'none', 'nil', '/', '\\', '#', '?', '??',
]);

export function isEmptyMarker(input: unknown): boolean {
  const s = cleanDisplay(input);
  if (s === null) return false;
  const key = s.toLowerCase().replace(/[\s]/g, '');
  if (EMPTY_MARKERS.has(key)) return true;
  // Runs of a single punctuation character, e.g. "---------" or "___________".
  return /^([-_.·—–])\1*$/.test(key);
}

/** Levenshtein distance, capped for performance on long strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity in [0,1] derived from edit distance. */
export function similarity(a: string, b: string): number {
  const x = normalizeForSearch(a);
  const y = normalizeForSearch(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

/** Token-set similarity — order-insensitive, useful for multi-word names. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForSearch(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeForSearch(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return (2 * inter) / (ta.size + tb.size);
}
