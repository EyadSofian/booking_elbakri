/**
 * Enumerations used by the legacy-workbook parsers.
 *
 * These values are stored as-is; labels live in the web app's dictionaries.
 */

export const Currency = {
  EGP: 'EGP',
  USD: 'USD',
  EUR: 'EUR',
  SAR: 'SAR',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

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
