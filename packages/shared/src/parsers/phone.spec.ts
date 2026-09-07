import { ParseStatus } from '../domain/enums';
import { parseLegacyPhone } from './phone';

describe('parseLegacyPhone — values stored as floats in the legacy sheets', () => {
  it('renders a large float without exponent notation', () => {
    const r = parseLegacyPhone(96181237752);
    expect(r.digits).toBe('96181237752');
    expect(r.normalized).toBe('+96181237752');
    expect(r.countryCallingCode).toBe('961');
    expect(r.warnings).toContain('STORED_AS_NUMBER_LEADING_ZEROS_MAY_BE_LOST');
  });
  it('never produces "9.6181237752e+10"', () => {
    expect(parseLegacyPhone(96181237752).digits).not.toContain('e');
    expect(parseLegacyPhone(2250779040464).digits).toBe('2250779040464');
  });
  it('restores an Egyptian leading zero but marks it as an assumption', () => {
    const r = parseLegacyPhone(1002998299);
    expect(r.digits).toBe('01002998299');
    expect(r.normalized).toBe('+201002998299');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
    expect(r.warnings).toContain('RESTORED_LEADING_ZERO_EGYPT');
  });
  it('keeps a string phone with its formatting intact in raw', () => {
    const r = parseLegacyPhone('961 76 460 597');
    expect(r.raw).toBe('961 76 460 597');
    expect(r.digits).toBe('96176460597');
    expect(r.normalized).toBe('+96176460597');
  });
  it('honours an explicit + prefix with full confidence', () => {
    const r = parseLegacyPhone('+201002998299');
    expect(r.status).toBe(ParseStatus.PARSED);
    expect(r.normalized).toBe('+201002998299');
  });
  it('converts a 00 international prefix', () => {
    const r = parseLegacyPhone('0096170545718');
    expect(r.normalized).toBe('+96170545718');
    expect(r.warnings).toContain('INTERNATIONAL_00_PREFIX');
  });
  it('preserves a leading zero present in a string', () => {
    const r = parseLegacyPhone('01002998299');
    expect(r.digits).toBe('01002998299');
    expect(r.normalized).toBe('+201002998299');
  });
  it('does not normalise a number it cannot attribute to a country', () => {
    const r = parseLegacyPhone('55512345');
    expect(r.normalized).toBeNull();
    expect(r.digits).toBe('55512345');
    expect(r.raw).toBe('55512345');
  });
  it('recognises blank markers', () => {
    expect(parseLegacyPhone('-').status).toBe(ParseStatus.EMPTY_MARKER);
  });
});
