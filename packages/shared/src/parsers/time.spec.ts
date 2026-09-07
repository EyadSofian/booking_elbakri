import { ParseStatus } from '../domain/enums';
import { parseLegacyTime } from './time';

describe('parseLegacyTime — real pickup values from the TRANSFER sheet', () => {
  it('reads a native Excel time', () => {
    const r = parseLegacyTime(new Date(Date.UTC(1899, 11, 30, 19, 0, 0)));
    expect(r.value).toBe('19:00');
    expect(r.status).toBe(ParseStatus.NATIVE);
  });
  it('reads an Excel day fraction', () => {
    expect(parseLegacyTime(0.5).value).toBe('12:00');
    expect(parseLegacyTime(0.8125).value).toBe('19:30');
  });
  it('handles spaces around the colon: "19 : 20"', () => {
    const r = parseLegacyTime('19 : 20');
    expect(r.value).toBe('19:20');
    expect(r.minutes).toBe(19 * 60 + 20);
  });
  it('handles "9 :30 AM"', () => {
    expect(parseLegacyTime('9 :30 AM').value).toBe('09:30');
  });
  it('handles "12 : 00 PM" as noon', () => {
    expect(parseLegacyTime('12 : 00 PM').value).toBe('12:00');
  });
  it('handles "12 : 00 AM" as midnight', () => {
    expect(parseLegacyTime('12 : 00 AM').value).toBe('00:00');
  });
  it('keeps the 24-hour reading of the contradictory "22:30 PM" and flags it', () => {
    const r = parseLegacyTime('22:30 PM');
    expect(r.value).toBe('22:30');
    expect(r.warnings).toContain('CONTRADICTORY_MERIDIEM');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
  });
  it('maps "AT NOON" to an approximate time and flags it for confirmation', () => {
    const r = parseLegacyTime('AT NOON');
    expect(r.value).toBe('12:00');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
    expect(r.warnings).toContain('APPROXIMATE_TIME');
    expect(r.confidence).toBeLessThan(0.5);
  });
  it('keeps "15 :00" without a meridiem as 15:00', () => {
    expect(parseLegacyTime('15 :00').value).toBe('15:00');
  });
  it('accepts a semicolon mistyped for the colon: "13;10"', () => {
    expect(parseLegacyTime('13;10').value).toBe('13:10');
    expect(parseLegacyTime('16;50 pm').value).toBe('16:50');
  });
  it('rejects impossible minute values', () => {
    expect(parseLegacyTime('19:75').status).toBe(ParseStatus.UNPARSEABLE);
  });
  it('marks unknown text unparseable and preserves the raw value', () => {
    const r = parseLegacyTime('after lunch sometime');
    expect(r.minutes).toBeNull();
    expect(r.raw).toBe('after lunch sometime');
  });
  it('treats a bare date serial in the pickup column as ambiguous, not a time', () => {
    const r = parseLegacyTime(45860);
    expect(r.minutes).toBeNull();
    expect(r.warnings).toContain('DATE_SERIAL_IN_TIME_COLUMN');
  });
});
