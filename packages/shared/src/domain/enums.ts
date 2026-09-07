/**
 * Canonical domain enumerations.
 *
 * These values are the ONLY thing stored in the database.
 * Human-readable labels live in the i18n dictionaries (en / ar) on the web app.
 * Never store a translated label as a database value.
 */

export const TripFileStatus = {
  DRAFT: 'DRAFT',
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
} as const;
export type TripFileStatus = (typeof TripFileStatus)[keyof typeof TripFileStatus];

export const HotelBookingStatus = {
  DRAFT: 'DRAFT',
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
} as const;
export type HotelBookingStatus = (typeof HotelBookingStatus)[keyof typeof HotelBookingStatus];

export const TransferStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ASSIGNED: 'ASSIGNED',
  DISPATCHED: 'DISPATCHED',
  PICKED_UP: 'PICKED_UP',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

export const TransferDirection = {
  ARRIVAL: 'ARRIVAL',
  DEPARTURE: 'DEPARTURE',
  INTER_HOTEL: 'INTER_HOTEL',
  EXCURSION: 'EXCURSION',
  OTHER: 'OTHER',
} as const;
export type TransferDirection = (typeof TransferDirection)[keyof typeof TransferDirection];

export const ExcursionStatus = {
  DRAFT: 'DRAFT',
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
} as const;
export type ExcursionStatus = (typeof ExcursionStatus)[keyof typeof ExcursionStatus];

export const VisaStatus = {
  DRAFT: 'DRAFT',
  DOCUMENTS_PENDING: 'DOCUMENTS_PENDING',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type VisaStatus = (typeof VisaStatus)[keyof typeof VisaStatus];

export const FinancialDocumentType = {
  PAYABLE: 'PAYABLE',
  RECEIVABLE: 'RECEIVABLE',
} as const;
export type FinancialDocumentType =
  (typeof FinancialDocumentType)[keyof typeof FinancialDocumentType];

export const FinancialDocumentStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERPAID: 'OVERPAID',
  CANCELLED: 'CANCELLED',
} as const;
export type FinancialDocumentStatus =
  (typeof FinancialDocumentStatus)[keyof typeof FinancialDocumentStatus];

export const PaymentStatus = {
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
  REVERSAL: 'REVERSAL',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  CARD: 'CARD',
  CREDIT_NOTE: 'CREDIT_NOTE',
  OFFSET: 'OFFSET',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const CounterpartyType = {
  HOTEL: 'HOTEL',
  AGENCY: 'AGENCY',
  SUPPLIER: 'SUPPLIER',
  DRIVER: 'DRIVER',
  CUSTOMER: 'CUSTOMER',
  OTHER: 'OTHER',
} as const;
export type CounterpartyType = (typeof CounterpartyType)[keyof typeof CounterpartyType];

export const PartnerType = {
  TRAVEL_AGENCY: 'TRAVEL_AGENCY',
  INTERNAL: 'INTERNAL',
  SUPPLIER: 'SUPPLIER',
  OTHER: 'OTHER',
} as const;
export type PartnerType = (typeof PartnerType)[keyof typeof PartnerType];

export const Currency = {
  EGP: 'EGP',
  USD: 'USD',
  EUR: 'EUR',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

/** Parse outcome shared by every legacy value normalizer. */
export const ParseStatus = {
  /** Value was already a native typed value (Excel date/time/number). */
  NATIVE: 'NATIVE',
  /** Value was text and was parsed with high confidence. */
  PARSED: 'PARSED',
  /** Value was text, parsed, but the interpretation is uncertain. */
  AMBIGUOUS: 'AMBIGUOUS',
  /** Value is a recognised "empty" marker such as `-` or `----`. */
  EMPTY_MARKER: 'EMPTY_MARKER',
  /** Value could not be interpreted at all. */
  UNPARSEABLE: 'UNPARSEABLE',
  /** No value present. */
  MISSING: 'MISSING',
} as const;
export type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];

export const ImportRunStatus = {
  UPLOADED: 'UPLOADED',
  ANALYZING: 'ANALYZING',
  ANALYZED: 'ANALYZED',
  MAPPING: 'MAPPING',
  PREVIEWED: 'PREVIEWED',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type ImportRunStatus = (typeof ImportRunStatus)[keyof typeof ImportRunStatus];

/** How a scanned physical row was classified by the continuation-row algorithm. */
export const ImportRowKind = {
  /** Sheet title / banner row above the header. */
  BANNER: 'BANNER',
  /** The column header row. */
  HEADER: 'HEADER',
  /** A labelled divider inside the data (e.g. `new 2026`). */
  SECTION: 'SECTION',
  /** Row that starts a new master record (NAME present). */
  MASTER: 'MASTER',
  /** Blank-NAME row carrying extra service data for the active master. */
  CONTINUATION: 'CONTINUATION',
  /** Structurally empty row. */
  BLANK: 'BLANK',
  /** Has data but no active master to attach to. */
  ORPHAN: 'ORPHAN',
} as const;
export type ImportRowKind = (typeof ImportRowKind)[keyof typeof ImportRowKind];

export const DataQualityCategory = {
  DATE_ERROR: 'DATE_ERROR',
  TIME_PARSE_ERROR: 'TIME_PARSE_ERROR',
  MONEY_PARSE_ERROR: 'MONEY_PARSE_ERROR',
  UNKNOWN_ALIAS: 'UNKNOWN_ALIAS',
  POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE',
  ORPHAN_CONTINUATION_ROW: 'ORPHAN_CONTINUATION_ROW',
  FINANCIAL_RECONCILIATION_MISMATCH: 'FINANCIAL_RECONCILIATION_MISMATCH',
  MISSING_REQUIRED_VALUE: 'MISSING_REQUIRED_VALUE',
  SUSPICIOUS_YEAR: 'SUSPICIOUS_YEAR',
  UNKNOWN_LEGACY_COLUMN: 'UNKNOWN_LEGACY_COLUMN',
  INVALID_STATUS: 'INVALID_STATUS',
  PHONE_PARSE_ERROR: 'PHONE_PARSE_ERROR',
  AMBIGUOUS_VALUE: 'AMBIGUOUS_VALUE',
} as const;
export type DataQualityCategory =
  (typeof DataQualityCategory)[keyof typeof DataQualityCategory];

export const DataQualitySeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;
export type DataQualitySeverity =
  (typeof DataQualitySeverity)[keyof typeof DataQualitySeverity];

export const DataQualityStatus = {
  OPEN: 'OPEN',
  REVIEWING: 'REVIEWING',
  RESOLVED: 'RESOLVED',
  IGNORED_WITH_REASON: 'IGNORED_WITH_REASON',
} as const;
export type DataQualityStatus =
  (typeof DataQualityStatus)[keyof typeof DataQualityStatus];

export const MatchConfidence = {
  EXACT: 'EXACT',
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  POSSIBLE: 'POSSIBLE',
  NO_MATCH: 'NO_MATCH',
} as const;
export type MatchConfidence = (typeof MatchConfidence)[keyof typeof MatchConfidence];

export const AliasStatus = {
  SUGGESTED: 'SUGGESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AliasStatus = (typeof AliasStatus)[keyof typeof AliasStatus];

export const Locale = {
  EN: 'en',
  AR: 'ar',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
