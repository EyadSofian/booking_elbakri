import { MatchConfidence } from '../domain/enums';
import { normalizeAliasKey, similarity, tokenSimilarity } from '../parsers/text';

export interface MasterRecord {
  id: string;
  /** Canonical display name. */
  name: string;
  /** Pre-computed normalised form of `name`. */
  normalizedName: string;
  /** Approved alias keys pointing at this record. */
  aliasKeys?: string[];
}

export interface AliasResolution {
  input: string;
  key: string;
  match: MasterRecord | null;
  confidence: MatchConfidence;
  score: number;
  method: 'CANONICAL' | 'ALIAS' | 'FUZZY' | 'NONE';
  /** Alternatives shown to the reviewer when the result is not decisive. */
  suggestions: Array<{ record: MasterRecord; score: number }>;
  /** True when a human must confirm before the value is used. */
  requiresReview: boolean;
}

/**
 * Resolve a free-text legacy value to a master record.
 *
 * Resolution is deterministic first (canonical name, then approved alias) and
 * only falls back to similarity as a *suggestion*. Fuzzy results never link
 * automatically: silently merging "SAMA" with "SAMA TOURS" would destroy the
 * distinction if they turn out to be different partners.
 */
export function resolveAlias(
  input: string | null | undefined,
  masters: MasterRecord[],
  opts: { fuzzyThreshold?: number; maxSuggestions?: number } = {},
): AliasResolution {
  const fuzzyThreshold = opts.fuzzyThreshold ?? 0.82;
  const maxSuggestions = opts.maxSuggestions ?? 5;
  const key = normalizeAliasKey(input);
  const base: AliasResolution = {
    input: input ?? '', key, match: null, confidence: MatchConfidence.NO_MATCH,
    score: 0, method: 'NONE', suggestions: [], requiresReview: false,
  };

  if (!key) return base;

  const canonical = masters.find((m) => m.normalizedName === key);
  if (canonical) {
    return { ...base, match: canonical, confidence: MatchConfidence.EXACT, score: 1, method: 'CANONICAL' };
  }

  const viaAlias = masters.filter((m) => (m.aliasKeys ?? []).includes(key));
  if (viaAlias.length === 1) {
    return { ...base, match: viaAlias[0], confidence: MatchConfidence.EXACT, score: 1, method: 'ALIAS' };
  }
  if (viaAlias.length > 1) {
    // The same alias approved on two masters is a data problem, not a match.
    return {
      ...base,
      confidence: MatchConfidence.POSSIBLE,
      suggestions: viaAlias.map((r) => ({ record: r, score: 1 })),
      requiresReview: true,
    };
  }

  const scored = masters
    .map((m) => ({ record: m, score: Math.max(similarity(key, m.normalizedName), tokenSimilarity(key, m.normalizedName)) }))
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);

  if (!scored.length) {
    return { ...base, requiresReview: true };
  }

  const top = scored[0];
  const runnerUp = scored[1];
  const decisive = top.score >= fuzzyThreshold && (!runnerUp || top.score - runnerUp.score >= 0.08);

  return {
    ...base,
    match: null, // A fuzzy hit is a suggestion, never an applied link.
    confidence: decisive ? MatchConfidence.HIGH_CONFIDENCE : MatchConfidence.POSSIBLE,
    score: Math.round(top.score * 100) / 100,
    method: 'FUZZY',
    suggestions: scored.map((s) => ({ record: s.record, score: Math.round(s.score * 100) / 100 })),
    requiresReview: true,
  };
}
