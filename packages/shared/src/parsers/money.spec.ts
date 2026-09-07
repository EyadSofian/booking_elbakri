import { Currency, ParseStatus, PaymentMethod } from '../domain/enums';
import { moneyEquals, parseLegacyMoney, roundMoney } from './money';

describe('parseLegacyMoney — real values from the PYAMNT payment sheet', () => {
  it('accepts a plain number', () => {
    const r = parseLegacyMoney(138510);
    expect(r.amount).toBe(138510);
    expect(r.status).toBe(ParseStatus.NATIVE);
  });
  it('parses "23500 LE" with its currency', () => {
    const r = parseLegacyMoney('23500 LE');
    expect(r.amount).toBe(23500);
    expect(r.currency).toBe(Currency.EGP);
    expect(r.status).toBe(ParseStatus.PARSED);
  });
  it('parses thousands separators: "45,900 LE"', () => {
    const r = parseLegacyMoney('45,900 LE');
    expect(r.amount).toBe(45900);
    expect(r.currency).toBe(Currency.EGP);
  });
  it('extracts both the amount and the method from "3050 credit"', () => {
    const r = parseLegacyMoney('3050 credit');
    expect(r.amount).toBe(3050);
    expect(r.method).toBe(PaymentMethod.CREDIT_NOTE);
  });
  it('does not invent a figure for a bare "credit"', () => {
    const r = parseLegacyMoney('credit');
    expect(r.amount).toBeNull();
    expect(r.method).toBe(PaymentMethod.CREDIT_NOTE);
    expect(r.status).toBe(ParseStatus.UNPARSEABLE);
    expect(r.warnings).toContain('METHOD_WITHOUT_AMOUNT');
    expect(r.raw).toBe('credit');
  });
  it('sums an additive expression but flags it: "116000 + 58000 LE"', () => {
    const r = parseLegacyMoney('116000 + 58000 LE');
    expect(r.amount).toBe(174000);
    expect(r.components).toEqual([116000, 58000]);
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
    expect(r.warnings).toContain('SUM_OF_MULTIPLE_COMPONENTS');
  });
  it('treats "-" and "." as blank markers rather than zero', () => {
    expect(parseLegacyMoney('-').status).toBe(ParseStatus.EMPTY_MARKER);
    expect(parseLegacyMoney('-').amount).toBeNull();
    expect(parseLegacyMoney('.').status).toBe(ParseStatus.EMPTY_MARKER);
    expect(parseLegacyMoney('---------').status).toBe(ParseStatus.EMPTY_MARKER);
    expect(parseLegacyMoney('_____________').status).toBe(ParseStatus.EMPTY_MARKER);
  });
  it('does not silently drop the stray Arabic letter "د"', () => {
    const r = parseLegacyMoney('د');
    expect(r.amount).toBeNull();
    expect(r.status).toBe(ParseStatus.UNPARSEABLE);
    expect(r.raw).toBe('د');
    expect(r.residualNote).toBe('د');
  });
  it('reads "45900 EG" as Egyptian pounds', () => {
    const r = parseLegacyMoney('45900 EG');
    expect(r.amount).toBe(45900);
    expect(r.currency).toBe(Currency.EGP);
  });
  it('never behaves like parseFloat on trailing text', () => {
    // parseFloat('23500 LE') would return 23500 and silently lose "LE".
    const r = parseLegacyMoney('23500 something odd');
    expect(r.residualNote).toBe('something odd');
    expect(r.status).toBe(ParseStatus.AMBIGUOUS);
    expect(r.warnings).toContain('UNEXPECTED_TEXT_IN_MONEY_CELL');
  });
  it('refuses to pick one of several unrelated numbers', () => {
    const r = parseLegacyMoney('1000 2000 3000');
    expect(r.amount).toBeNull();
    expect(r.components).toEqual([1000, 2000, 3000]);
  });
});

describe('money helpers', () => {
  it('rounds away float drift', () => {
    expect(roundMoney(2365.2 - 2365)).toBe(0.2);
  });
  it('compares within tolerance', () => {
    expect(moneyEquals(0.1999999999998, 0.2)).toBe(true);
    expect(moneyEquals(100, 100.5)).toBe(false);
  });
});
