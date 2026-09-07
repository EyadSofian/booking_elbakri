import { MatchConfidence } from '../domain/enums';
import { normalizeForSearch, similarity, tokenSimilarity } from '../parsers/text';

export interface TravelerCandidate {
  id: string;
  fullName: string;
  normalizedName: string;
  phoneNormalized?: string | null;
  phoneDigits?: string | null;
  nationalityCode?: string | null;
  partnerId?: string | null;
}

export interface TravelerProbe {
  fullName: string;
  phoneNormalized?: string | null;
  phoneDigits?: string | null;
  nationalityCode?: string | null;
  partnerId?: string | null;
  /** Dates of the service being imported, used as corroborating evidence. */
  serviceDates?: Date[];
}

export interface MatchEvidence {
  field: string;
  weight: number;
  detail: string;
}

export interface MatchResult {
  candidateId: string;
  confidence: MatchConfidence;
  score: number;
  evidence: MatchEvidence[];
  /** Only ever true for deterministic identity evidence. */
  autoLinkable: boolean;
}

/**
 * Score a traveller against known records.
 *
 * Names alone never link two people. Auto-linking requires an exact normalised
 * name AND an identical phone number; everything weaker is surfaced for a human
 * to approve, and the decision is audited.
 */
export function matchTraveler(
  probe: TravelerProbe,
  candidates: TravelerCandidate[],
): MatchResult[] {
  const probeName = normalizeForSearch(probe.fullName);
  const results: MatchResult[] = [];

  for (const c of candidates) {
    const evidence: MatchEvidence[] = [];
    let score = 0;

    const exactName = probeName.length > 0 && probeName === c.normalizedName;
    const nameSim = Math.max(similarity(probe.fullName, c.fullName), tokenSimilarity(probe.fullName, c.fullName));

    if (exactName) {
      score += 0.45;
      evidence.push({ field: 'name', weight: 0.45, detail: 'exact normalised name match' });
    } else if (nameSim >= 0.85) {
      score += 0.3;
      evidence.push({ field: 'name', weight: 0.3, detail: `name similarity ${nameSim.toFixed(2)}` });
    } else if (nameSim >= 0.7) {
      score += 0.15;
      evidence.push({ field: 'name', weight: 0.15, detail: `weak name similarity ${nameSim.toFixed(2)}` });
    } else {
      // Without a name signal the remaining evidence cannot identify a person.
      continue;
    }

    let phoneExact = false;
    if (probe.phoneNormalized && c.phoneNormalized && probe.phoneNormalized === c.phoneNormalized) {
      phoneExact = true;
      score += 0.4;
      evidence.push({ field: 'phone', weight: 0.4, detail: 'identical E.164 phone' });
    } else if (probe.phoneDigits && c.phoneDigits) {
      const a = probe.phoneDigits.replace(/^0+/, '');
      const b = c.phoneDigits.replace(/^0+/, '');
      if (a && b && (a.endsWith(b) || b.endsWith(a)) && Math.min(a.length, b.length) >= 8) {
        score += 0.25;
        evidence.push({ field: 'phone', weight: 0.25, detail: 'phone suffix match' });
      }
    }

    if (probe.nationalityCode && c.nationalityCode && probe.nationalityCode === c.nationalityCode) {
      score += 0.1;
      evidence.push({ field: 'nationality', weight: 0.1, detail: 'same nationality' });
    }
    if (probe.partnerId && c.partnerId && probe.partnerId === c.partnerId) {
      score += 0.1;
      evidence.push({ field: 'partner', weight: 0.1, detail: 'same travel agency' });
    }

    let confidence: MatchConfidence;
    if (exactName && phoneExact) confidence = MatchConfidence.EXACT;
    else if (score >= 0.7) confidence = MatchConfidence.HIGH_CONFIDENCE;
    else if (score >= 0.45) confidence = MatchConfidence.POSSIBLE;
    else confidence = MatchConfidence.NO_MATCH;

    if (confidence === MatchConfidence.NO_MATCH) continue;

    results.push({
      candidateId: c.id,
      confidence,
      score: Math.round(score * 100) / 100,
      evidence,
      autoLinkable: exactName && phoneExact,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * A match may be applied without review only when it is the single exact
 * identity match. Any ambiguity — including two equally exact candidates —
 * goes to a human.
 */
export function selectAutoLink(results: MatchResult[]): MatchResult | null {
  const exact = results.filter((r) => r.autoLinkable);
  return exact.length === 1 ? exact[0] : null;
}
