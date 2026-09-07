import { ParseStatus } from '../domain/enums';
import { excelSerialToDate, nightsBetween, parseLegacyDate } from './date';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('excelSerialToDate', () => {
  it('converts a modern serial correctly', () => {
    // In the 1900 date system 45658 is 2025-01-01, so 45860 is 2025-07-22.
    expect(iso(excelSerialToDate(45658))).toBe('2025-01-01');
    expect(iso(excelSerialToDate(45860))).toBe('2025-07-22');
  });
  it('compensates for the fictitious 29-Feb-1900', () => {
    expect(iso(excelSerialToDate(59))).toBe('1900-02-28');
    expect(iso(excelSerialToDate(61))).toBe('1900-03-01');
  });
  it('rejects out-of-range serials', () => {
    expect(excelSerialToDate(0)).toBeNull();
    expect(excelSerialToDate(-5)).toBeNull();
    expect(excelSerialToDate(999999)).toBeNull();
  });
});

describe('parseLegacyDate — native values', () => {
  it('accepts a Date from the workbook reader', () => {
    const r = parseLegacyDate(new Date(Date.UTC(2025, 6, 22)));
    expect(r.status).toBe(ParseStatus.NATIVE);
    expect(iso(r.value)).toBe('2025-07-22');
    expect(r.confidence).toBe(1);
  });
  it('treats Excel serial 0 as a blank marker, not 1900-01-00', () => {
    const r = parseLegacyDate(0);
    expect(r.status).toBe(ParseStatus.EMPTY_MARKER);
    expect(r.value).toBeNull();
    expect(r.raw).toBe('0');
  });
});

describe('parseLegacyDate — real legacy strings from the source workbooks', () => {
  it('parses Arabic month names with an assumed year', () => {
    const r = parseLegacyDate('22 يوليـو', { assumeYear: 2025 });
    expect(iso(r.value)).toBe('2025-07-22');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
    expect(r.warnings).toContain('ASSUMED_YEAR');
  });
  it('parses another Arabic month spelling', () => {
    expect(iso(parseLegacyDate('25 ابريل', { assumeYear: 2025 }).value)).toBe('2025-04-25');
  });
  it('parses misspelled English months', () => {
    expect(iso(parseLegacyDate('7 AUGAST', { assumeYear: 2025 }).value)).toBe('2025-08-07');
    expect(iso(parseLegacyDate('31 auguest', { assumeYear: 2025 }).value)).toBe('2025-08-31');
  });
  it('refuses to invent a date for the impossible "31 april"', () => {
    const r = parseLegacyDate('31 april', { assumeYear: 2025 });
    expect(r.value).toBeNull();
    expect(r.status).toBe(ParseStatus.UNPARSEABLE);
    expect(r.warnings).toContain('IMPOSSIBLE_CALENDAR_DATE');
    expect(r.raw).toBe('31 april');
  });
  it('refuses to choose between two dates in one cell', () => {
    const r = parseLegacyDate('3 april, 8 april', { assumeYear: 2025 });
    expect(r.value).toBeNull();
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
    expect(r.warnings).toContain('MULTIPLE_DATES_IN_ONE_CELL');
  });
  it('recognises "-" as an empty marker rather than a date', () => {
    const r = parseLegacyDate('-');
    expect(r.status).toBe(ParseStatus.EMPTY_MARKER);
    expect(r.value).toBeNull();
  });
  it('will not guess a year when none is available', () => {
    const r = parseLegacyDate('22 يوليو');
    expect(r.value).toBeNull();
    expect(r.warnings).toContain('MISSING_YEAR');
  });
});

describe('parseLegacyDate — numeric and ISO forms', () => {
  it('parses ISO', () => {
    expect(iso(parseLegacyDate('2025-07-22').value)).toBe('2025-07-22');
  });
  it('prefers day-first for ambiguous numeric dates but flags it', () => {
    const r = parseLegacyDate('5/6/2025');
    expect(iso(r.value)).toBe('2025-06-05');
    expect(r.warnings).toContain('AMBIGUOUS_DAY_MONTH');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
  });
  it('resolves unambiguously when one part exceeds 12', () => {
    const r = parseLegacyDate('22/7/2025');
    expect(iso(r.value)).toBe('2025-07-22');
    expect(r.warnings).not.toContain('AMBIGUOUS_DAY_MONTH');
  });
  it('flags suspicious years', () => {
    expect(parseLegacyDate('2003-01-01').warnings).toContain('SUSPICIOUS_YEAR');
  });
  it('marks unknown text unparseable and keeps the raw value', () => {
    const r = parseLegacyDate('arrival');
    expect(r.status).toBe(ParseStatus.UNPARSEABLE);
    expect(r.raw).toBe('arrival');
  });
});

describe('nightsBetween', () => {
  it('counts whole nights', () => {
    expect(nightsBetween(new Date(Date.UTC(2025, 6, 22)), new Date(Date.UTC(2025, 6, 25)))).toBe(3);
  });
  it('returns 0 for a same-day stay', () => {
    expect(nightsBetween(new Date(Date.UTC(2026, 7, 18)), new Date(Date.UTC(2026, 7, 18)))).toBe(0);
  });
  it('returns a negative count for reversed dates', () => {
    expect(nightsBetween(new Date(Date.UTC(2025, 7, 31)), new Date(Date.UTC(2025, 7, 3)))).toBe(-28);
  });
});
