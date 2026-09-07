import { MatchConfidence } from '../domain/enums';
import { normalizeForSearch } from '../parsers/text';
import { matchTraveler, selectAutoLink, TravelerCandidate } from './matching';

const candidate = (over: Partial<TravelerCandidate> & { id: string; fullName: string }): TravelerCandidate => ({
  normalizedName: normalizeForSearch(over.fullName),
  ...over,
});

describe('matchTraveler', () => {
  const known: TravelerCandidate[] = [
    candidate({ id: 't1', fullName: 'JOSEPH FAKHRY', phoneNormalized: '+96181237752', phoneDigits: '96181237752', nationalityCode: 'LB' }),
    candidate({ id: 't2', fullName: 'NAWEL BELHADI', phoneNormalized: '+33602088062', phoneDigits: '33602088062', nationalityCode: 'DZ' }),
    candidate({ id: 't3', fullName: 'Joseph Hanna', phoneNormalized: '+96176191169', phoneDigits: '96176191169', nationalityCode: 'LB' }),
  ];

  it('returns EXACT for an identical name and phone', () => {
    const [top] = matchTraveler({ fullName: 'joseph fakhry', phoneNormalized: '+96181237752' }, known);
    expect(top.candidateId).toBe('t1');
    expect(top.confidence).toBe(MatchConfidence.EXACT);
    expect(top.autoLinkable).toBe(true);
  });

  it('matches across the leading-space variant seen in the source sheets', () => {
    const [top] = matchTraveler({ fullName: ' NAWEL BELHADI ', phoneNormalized: '+33602088062' }, known);
    expect(top.candidateId).toBe('t2');
    expect(top.confidence).toBe(MatchConfidence.EXACT);
  });

  it('never auto-links on a name alone', () => {
    const results = matchTraveler({ fullName: 'JOSEPH FAKHRY' }, known);
    expect(results[0].autoLinkable).toBe(false);
    expect(selectAutoLink(results)).toBeNull();
  });

  it('does not confuse two different people who share a first name', () => {
    const results = matchTraveler({ fullName: 'Joseph Hanna', phoneNormalized: '+96176191169' }, known);
    expect(results[0].candidateId).toBe('t3');
    expect(results[0].confidence).toBe(MatchConfidence.EXACT);
    const fakhry = results.find((r) => r.candidateId === 't1');
    expect(fakhry?.autoLinkable ?? false).toBe(false);
  });

  it('ignores candidates with no name signal at all', () => {
    expect(matchTraveler({ fullName: 'Totally Different Person' }, known)).toHaveLength(0);
  });

  it('refuses to auto-link when two candidates are equally exact', () => {
    const twins: TravelerCandidate[] = [
      candidate({ id: 'a', fullName: 'ali', phoneNormalized: '+96170000000' }),
      candidate({ id: 'b', fullName: 'ali', phoneNormalized: '+96170000000' }),
    ];
    const results = matchTraveler({ fullName: 'ali', phoneNormalized: '+96170000000' }, twins);
    expect(results.filter((r) => r.autoLinkable)).toHaveLength(2);
    expect(selectAutoLink(results)).toBeNull();
  });

  it('reports a phone suffix match as supporting evidence only', () => {
    const results = matchTraveler({ fullName: 'JOSEPH FAKHRY', phoneDigits: '081237752' }, known);
    expect(results[0].evidence.some((e) => e.detail === 'phone suffix match')).toBe(true);
    expect(results[0].autoLinkable).toBe(false);
  });
});
