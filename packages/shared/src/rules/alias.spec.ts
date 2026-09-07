import { MatchConfidence } from '../domain/enums';
import { normalizeAliasKey } from '../parsers/text';
import { MasterRecord, resolveAlias } from './alias';

const master = (id: string, name: string, aliases: string[] = []): MasterRecord => ({
  id, name,
  normalizedName: normalizeAliasKey(name),
  aliasKeys: aliases.map(normalizeAliasKey),
});

describe('resolveAlias — real agency spellings from the booking sheet', () => {
  const partners: MasterRecord[] = [
    master('p1', 'SAMA', ['SAMA TOURS', 'sama tours', 'Sama']),
    master('p2', 'YELLOW', ['YELOW', 'Yelow']),
    master('p3', 'ELBAKRI OVERSEAS', ['البكري اوفرسيز', 'elbakri', 'ELBAKRI OVER SEAS']),
    master('p4', 'TAZKARA', ['tazkra', 'Tazkra']),
  ];

  it('matches the canonical name exactly regardless of case', () => {
    const r = resolveAlias('sama', partners);
    expect(r.match?.id).toBe('p1');
    expect(r.method).toBe('CANONICAL');
    expect(r.requiresReview).toBe(false);
  });

  it('resolves an approved alias', () => {
    const r = resolveAlias('SAMA TOURS', partners);
    expect(r.match?.id).toBe('p1');
    expect(r.method).toBe('ALIAS');
  });

  it('folds Arabic letter variants when matching', () => {
    // Sheet contains both البكري and البكرى.
    const r = resolveAlias('البكرى اوفرسيز', partners);
    expect(r.match?.id).toBe('p3');
  });

  it('suggests but never applies a fuzzy match', () => {
    const r = resolveAlias('YELOWW', partners);
    expect(r.match).toBeNull();
    expect(r.method).toBe('FUZZY');
    expect(r.requiresReview).toBe(true);
    expect(r.suggestions[0].record.id).toBe('p2');
  });

  it('does not silently merge an unknown agency', () => {
    const r = resolveAlias('Türkmen life', partners);
    expect(r.match).toBeNull();
    expect(r.requiresReview).toBe(true);
  });

  it('returns no match for an empty value', () => {
    const r = resolveAlias('   ', partners);
    expect(r.match).toBeNull();
    expect(r.confidence).toBe(MatchConfidence.NO_MATCH);
    expect(r.requiresReview).toBe(false);
  });

  it('treats an alias approved on two masters as a conflict needing review', () => {
    const conflicting = [master('x', 'ALPHA', ['shared']), master('y', 'BETA', ['shared'])];
    const r = resolveAlias('shared', conflicting);
    expect(r.match).toBeNull();
    expect(r.requiresReview).toBe(true);
    expect(r.suggestions).toHaveLength(2);
  });
});
