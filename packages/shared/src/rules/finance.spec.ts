import { FinancialDocumentStatus, PaymentStatus } from '../domain/enums';
import {
  calculateMargin, calculateMarginPercent, calculateOutstanding, calculatePaid,
  deriveDocumentStatus, reconcileLegacyPayment,
} from './finance';

const posted = (amount: number) => ({ amount, status: PaymentStatus.POSTED });
const reversed = (amount: number) => ({ amount, status: PaymentStatus.REVERSED });
const reversal = (amount: number) => ({ amount, status: PaymentStatus.REVERSAL });

describe('ledger calculations', () => {
  it('sums only posted transactions', () => {
    expect(calculatePaid([posted(1000), posted(500)])).toBe(1500);
  });
  it('excludes both sides of a reversal', () => {
    expect(calculatePaid([posted(1000), reversed(500), reversal(-500)])).toBe(1000);
  });
  it('derives outstanding from the ledger, never from a typed field', () => {
    expect(calculateOutstanding(29700, [posted(9700)])).toBe(20000);
  });
  it('rounds away float drift', () => {
    expect(calculateOutstanding(2365.2, [posted(2365)])).toBe(0.2);
  });
});

describe('deriveDocumentStatus', () => {
  it('is OPEN with no payments', () => {
    expect(deriveDocumentStatus(1000, [])).toBe(FinancialDocumentStatus.OPEN);
  });
  it('is PARTIALLY_PAID part-way', () => {
    expect(deriveDocumentStatus(1000, [posted(400)])).toBe(FinancialDocumentStatus.PARTIALLY_PAID);
  });
  it('is PAID when settled', () => {
    expect(deriveDocumentStatus(1000, [posted(600), posted(400)])).toBe(FinancialDocumentStatus.PAID);
  });
  it('is OVERPAID beyond the total', () => {
    expect(deriveDocumentStatus(1000, [posted(1200)])).toBe(FinancialDocumentStatus.OVERPAID);
  });
  it('returns to OPEN once every payment is reversed', () => {
    expect(deriveDocumentStatus(1000, [reversed(1000), reversal(-1000)])).toBe(FinancialDocumentStatus.OPEN);
  });
});

describe('reconcileLegacyPayment — real mismatches from the PYAMNT sheet', () => {
  it('flags row 41: total 29700, paid 9700, REST typed as 29700', () => {
    const r = reconcileLegacyPayment({
      legacyTotal: 29700, legacyPaid: 9700, legacyRest: 29700,
      totalAmount: 29700, payments: [posted(9700)],
    });
    expect(r.canonicalOutstanding).toBe(20000);
    expect(r.mismatch).toBe(true);
    expect(r.difference).toBe(9700);
    expect(r.reason).toBe('LEGACY_REST_DOES_NOT_MATCH_LEDGER');
  });

  it('detects that row 54 used REST as total + paid', () => {
    const r = reconcileLegacyPayment({
      legacyTotal: 9400, legacyPaid: 9400, legacyRest: 18800,
      totalAmount: 9400, payments: [posted(9400)],
    });
    expect(r.canonicalOutstanding).toBe(0);
    expect(r.mismatch).toBe(true);
    expect(r.restLooksLikeSum).toBe(true);
    expect(r.reason).toBe('LEGACY_REST_EQUALS_TOTAL_PLUS_PAID');
  });

  it('reports no mismatch when the legacy arithmetic was right', () => {
    const r = reconcileLegacyPayment({
      legacyTotal: 680, legacyPaid: 0, legacyRest: 680,
      totalAmount: 680, payments: [],
    });
    expect(r.mismatch).toBe(false);
    expect(r.difference).toBe(0);
  });

  it('does not raise a mismatch when the legacy REST was not numeric', () => {
    const r = reconcileLegacyPayment({
      legacyTotal: 9250, legacyPaid: null, legacyRest: null,
      totalAmount: 9250, payments: [],
    });
    expect(r.mismatch).toBe(false);
    expect(r.reason).toBe('LEGACY_REST_NOT_NUMERIC');
  });

  it('tolerates cent-level float drift (row 93)', () => {
    const r = reconcileLegacyPayment({
      legacyTotal: 2365.2, legacyPaid: 2365, legacyRest: 0.2,
      totalAmount: 2365.2, payments: [posted(2365)],
    });
    expect(r.mismatch).toBe(false);
  });
});

describe('visa margin', () => {
  it('derives margin from sell minus net', () => {
    expect(calculateMargin(125, 120)).toBe(5);
  });
  it('returns zero margin for the break-even legacy rows', () => {
    expect(calculateMargin(120, 120)).toBe(0);
  });
  it('is null when either side is unknown', () => {
    expect(calculateMargin(null, 120)).toBeNull();
    expect(calculateMargin(125, null)).toBeNull();
  });
  it('computes a margin percentage', () => {
    expect(calculateMarginPercent(125, 120)).toBe(4);
  });
});
