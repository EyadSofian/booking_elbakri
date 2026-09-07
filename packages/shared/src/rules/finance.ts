import { FinancialDocumentStatus, PaymentStatus } from '../domain/enums';
import { moneyEquals, roundMoney } from '../parsers/money';

export interface PaymentLike {
  amount: number;
  status: PaymentStatus;
}

/**
 * Sum of payments that currently count against a document.
 *
 * A reversal is recorded as its own transaction rather than by deleting the
 * original, so both the REVERSED original and the REVERSAL entry are excluded
 * and the history stays intact and auditable.
 */
export function calculatePaid(payments: PaymentLike[]): number {
  return roundMoney(
    payments
      .filter((p) => p.status === PaymentStatus.POSTED)
      .reduce((sum, p) => sum + p.amount, 0),
  );
}

/** Canonical outstanding balance. Never stored as a user-editable field. */
export function calculateOutstanding(totalAmount: number, payments: PaymentLike[]): number {
  return roundMoney(totalAmount - calculatePaid(payments));
}

/** Derive document status from the ledger; it is never set by hand. */
export function deriveDocumentStatus(
  totalAmount: number,
  payments: PaymentLike[],
  cancelled = false,
): FinancialDocumentStatus {
  if (cancelled) return FinancialDocumentStatus.CANCELLED;
  const paid = calculatePaid(payments);
  if (moneyEquals(paid, 0)) return FinancialDocumentStatus.OPEN;
  if (moneyEquals(paid, totalAmount)) return FinancialDocumentStatus.PAID;
  if (paid > totalAmount) return FinancialDocumentStatus.OVERPAID;
  return FinancialDocumentStatus.PARTIALLY_PAID;
}

export interface LegacyReconciliation {
  legacyTotal: number | null;
  legacyPaid: number | null;
  legacyRest: number | null;
  canonicalOutstanding: number;
  /** legacyRest - canonicalOutstanding, when both are known. */
  difference: number | null;
  mismatch: boolean;
  /**
   * Whether the legacy row appears to have used REST as a running total rather
   * than a remainder — a convention the source workbook mixes inconsistently.
   */
  restLooksLikeSum: boolean;
  reason: string | null;
}

/**
 * Compare the legacy sheet's hand-typed REST against the ledger balance.
 *
 * The historical file is never corrected. A mismatch becomes a
 * FINANCIAL_RECONCILIATION_MISMATCH issue for a finance user to resolve.
 */
export function reconcileLegacyPayment(input: {
  legacyTotal: number | null;
  legacyPaid: number | null;
  legacyRest: number | null;
  totalAmount: number;
  payments: PaymentLike[];
}): LegacyReconciliation {
  const canonicalOutstanding = calculateOutstanding(input.totalAmount, input.payments);
  const { legacyTotal, legacyPaid, legacyRest } = input;

  if (legacyRest === null) {
    return {
      legacyTotal, legacyPaid, legacyRest, canonicalOutstanding,
      difference: null, mismatch: false, restLooksLikeSum: false,
      reason: legacyTotal === null && legacyPaid === null ? null : 'LEGACY_REST_NOT_NUMERIC',
    };
  }

  const difference = roundMoney(legacyRest - canonicalOutstanding);
  const mismatch = !moneyEquals(difference, 0);

  let restLooksLikeSum = false;
  if (mismatch && legacyTotal !== null && legacyPaid !== null) {
    restLooksLikeSum = moneyEquals(legacyRest, roundMoney(legacyTotal + legacyPaid));
  }

  return {
    legacyTotal, legacyPaid, legacyRest, canonicalOutstanding, difference, mismatch, restLooksLikeSum,
    reason: !mismatch
      ? null
      : restLooksLikeSum
        ? 'LEGACY_REST_EQUALS_TOTAL_PLUS_PAID'
        : 'LEGACY_REST_DOES_NOT_MATCH_LEDGER',
  };
}

/** Visa margin is always derived; it is never an editable stored column. */
export function calculateMargin(sellAmount: number | null, netAmount: number | null): number | null {
  if (sellAmount === null || netAmount === null) return null;
  return roundMoney(sellAmount - netAmount);
}

export function calculateMarginPercent(sellAmount: number | null, netAmount: number | null): number | null {
  const margin = calculateMargin(sellAmount, netAmount);
  if (margin === null || !sellAmount) return null;
  return Math.round((margin / sellAmount) * 10000) / 100;
}
