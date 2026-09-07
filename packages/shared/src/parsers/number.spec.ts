import { ParseStatus } from '../domain/enums';
import { MAX_PLAUSIBLE_COUNT, parseLegacyCount } from './number';

describe('parseLegacyCount', () => {
  it('accepts an ordinary passenger count', () => {
    const r = parseLegacyCount(3);
    expect(r.value).toBe(3);
    expect(r.status).toBe(ParseStatus.NATIVE);
  });

  it('keeps the qualifying text in "3 with child"', () => {
    const r = parseLegacyCount('3 with child');
    expect(r.value).toBe(3);
    expect(r.residualNote).toBe('with child');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
  });

  it('sums an additive entry', () => {
    expect(parseLegacyCount('2 + 1').value).toBe(3);
  });

  it('rejects a phone number typed into the PAXS column', () => {
    // A real row in the excursions sheet has the columns shifted one across,
    // putting a phone number where the passenger count belongs. Accepting it
    // overflows the integer column at write time, long after the parser has
    // reported the row as fine.
    const r = parseLegacyCount(96170478393);
    expect(r.value).toBeNull();
    expect(r.status).toBe(ParseStatus.UNPARSEABLE);
    expect(r.warnings).toContain('IMPLAUSIBLE_COUNT');
    expect(r.raw).toBe('96170478393');
  });

  it('rejects an implausible count given as text', () => {
    expect(parseLegacyCount('96170478393').value).toBeNull();
  });

  it('accepts a large but plausible group', () => {
    expect(parseLegacyCount(MAX_PLAUSIBLE_COUNT).value).toBe(MAX_PLAUSIBLE_COUNT);
  });

  it('recognises blank markers', () => {
    expect(parseLegacyCount('-').status).toBe(ParseStatus.EMPTY_MARKER);
  });

  it('flags a negative count', () => {
    expect(parseLegacyCount(-2).warnings).toContain('NEGATIVE_COUNT');
  });
});
