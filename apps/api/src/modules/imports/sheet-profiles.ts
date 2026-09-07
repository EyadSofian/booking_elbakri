import { DataQualityCategory } from '@elbakri/shared';

/** Which legacy layout a worksheet holds. */
export type SheetKind =
  | 'HOTEL_BOOKING'
  | 'EXCURSION'
  | 'TRANSFER'
  | 'VISA'
  | 'PAYMENT'
  | 'PARTNER_SETTLEMENT'
  | 'EMPTY'
  | 'UNKNOWN';

export interface ColumnSpec {
  /** Worksheet column letter in the legacy file. */
  column: string;
  /** Logical field name used everywhere downstream. */
  field: string;
  /** Header text expected in the header row, used to auto-detect the layout. */
  header: string;
  kind: 'text' | 'date' | 'time' | 'money' | 'count' | 'phone';
}

export interface SheetProfile {
  kind: SheetKind;
  /** Human name for the reconciliation report. */
  label: string;
  /** Worksheet names this profile has been seen under. */
  sheetNameHints: string[];
  /** Row the column headers sit on in the supplied workbooks. */
  defaultHeaderRow: number;
  columns: ColumnSpec[];
  /** Field that starts a new master record. */
  masterField: string;
  /** Fields that make a blank-master row meaningful. */
  serviceFields: string[];
}

/**
 * Column maps for the four supplied workbooks.
 *
 * These are defaults, not hard-coded row numbers: the analyzer locates the
 * header row by matching header text, so a workbook with rows added above still
 * imports, and a sheet whose columns move is reported rather than mis-read.
 */
export const SHEET_PROFILES: SheetProfile[] = [
  {
    kind: 'HOTEL_BOOKING',
    label: 'Hotel bookings',
    sheetNameHints: ['sheet1'],
    defaultHeaderRow: 8,
    masterField: 'name',
    serviceFields: ['nationality', 'phone', 'checkIn', 'checkOut', 'hotel', 'roomType', 'mealPlan', 'bookingDate', 'agency', 'notes'],
    columns: [
      { column: 'A', field: 'name', header: 'NAME', kind: 'text' },
      { column: 'D', field: 'nationality', header: 'NATIONALITY', kind: 'text' },
      { column: 'F', field: 'phone', header: 'PHONE', kind: 'phone' },
      { column: 'H', field: 'checkIn', header: 'CHECK IN', kind: 'date' },
      { column: 'J', field: 'checkOut', header: 'CHECK OUT', kind: 'date' },
      { column: 'L', field: 'hotel', header: 'HOTEL', kind: 'text' },
      { column: 'O', field: 'roomType', header: 'TYPE ROOM', kind: 'text' },
      { column: 'Q', field: 'mealPlan', header: 'MEAL PLAN', kind: 'text' },
      { column: 'S', field: 'bookingDate', header: 'BOOKING DATE', kind: 'date' },
      { column: 'U', field: 'agency', header: 'TRAVEL AGENCY', kind: 'text' },
      { column: 'W', field: 'notes', header: '', kind: 'text' },
      { column: 'Z', field: 'legacyExtra', header: '', kind: 'text' },
    ],
  },
  {
    kind: 'EXCURSION',
    label: 'Excursions',
    sheetNameHints: ['sheet1'],
    defaultHeaderRow: 6,
    masterField: 'name',
    serviceFields: ['pax', 'child', 'phone', 'nationality', 'hotel', 'excursion', 'date', 'rest', 'agency', 'notes'],
    columns: [
      { column: 'A', field: 'name', header: 'NAME', kind: 'text' },
      { column: 'D', field: 'pax', header: 'PAXS', kind: 'count' },
      { column: 'E', field: 'child', header: 'CHILD', kind: 'count' },
      { column: 'G', field: 'phone', header: 'PHONE', kind: 'phone' },
      { column: 'I', field: 'nationality', header: 'NATIONALITY', kind: 'text' },
      { column: 'K', field: 'hotel', header: 'HOTEL', kind: 'text' },
      { column: 'M', field: 'excursion', header: 'EX', kind: 'text' },
      { column: 'O', field: 'date', header: 'DATE', kind: 'date' },
      // REST: meaning unknown. Captured verbatim, never interpreted.
      { column: 'Q', field: 'rest', header: 'REST', kind: 'text' },
      { column: 'S', field: 'agency', header: 'TRAVEL AGENCY', kind: 'text' },
      { column: 'U', field: 'notes', header: 'NOTES', kind: 'text' },
    ],
  },
  {
    kind: 'TRANSFER',
    label: 'Transfers',
    sheetNameHints: ['transfer'],
    defaultHeaderRow: 6,
    masterField: 'name',
    serviceFields: ['phone', 'from', 'to', 'pax', 'nationality', 'date', 'flight', 'pickup', 'agency', 'notes'],
    columns: [
      { column: 'A', field: 'name', header: 'NAME', kind: 'text' },
      { column: 'D', field: 'phone', header: 'PHONE', kind: 'phone' },
      { column: 'F', field: 'from', header: 'FROM', kind: 'text' },
      { column: 'H', field: 'to', header: 'TO', kind: 'text' },
      { column: 'J', field: 'pax', header: 'PAXS', kind: 'count' },
      { column: 'L', field: 'nationality', header: 'NATIONALITY', kind: 'text' },
      { column: 'N', field: 'date', header: 'DATE', kind: 'date' },
      { column: 'P', field: 'flight', header: 'FLIGHT NUMBER', kind: 'text' },
      { column: 'R', field: 'pickup', header: 'PICKUP', kind: 'time' },
      { column: 'T', field: 'agency', header: 'TRAVEL AGENCY', kind: 'text' },
      { column: 'V', field: 'notes', header: 'NOTES', kind: 'text' },
    ],
  },
  {
    kind: 'VISA',
    label: 'Visas',
    sheetNameHints: ['visa'],
    defaultHeaderRow: 6,
    masterField: 'name',
    serviceFields: ['phone', 'from', 'to', 'pax', 'nationality', 'date', 'agency', 'net', 'sell'],
    columns: [
      { column: 'A', field: 'name', header: 'NAME', kind: 'text' },
      { column: 'D', field: 'phone', header: 'PHONE', kind: 'phone' },
      { column: 'F', field: 'from', header: 'FROM', kind: 'text' },
      { column: 'H', field: 'to', header: 'TO', kind: 'text' },
      { column: 'J', field: 'pax', header: 'PAXS', kind: 'count' },
      { column: 'L', field: 'nationality', header: 'NATIONALITY', kind: 'text' },
      { column: 'N', field: 'date', header: 'DATE', kind: 'date' },
      { column: 'P', field: 'agency', header: 'TRAVEL AGENCY', kind: 'text' },
      { column: 'R', field: 'net', header: 'NET', kind: 'money' },
      { column: 'T', field: 'sell', header: 'SELL', kind: 'money' },
    ],
  },
  {
    kind: 'PAYMENT',
    label: 'Payments',
    sheetNameHints: ['payment'],
    defaultHeaderRow: 3,
    masterField: 'hotelName',
    serviceFields: ['total', 'paid', 'rest', 'paymentDate', 'checkIn', 'status'],
    columns: [
      { column: 'A', field: 'hotelName', header: 'HOTEL NAME', kind: 'text' },
      { column: 'D', field: 'total', header: 'TOTAL PAYMENT', kind: 'money' },
      { column: 'F', field: 'paid', header: 'PAID', kind: 'money' },
      { column: 'H', field: 'rest', header: 'REST', kind: 'money' },
      { column: 'J', field: 'paymentDate', header: 'DATE OF PAYMENT', kind: 'date' },
      { column: 'L', field: 'checkIn', header: 'CHECK IN', kind: 'date' },
      { column: 'N', field: 'status', header: '', kind: 'text' },
    ],
  },
  {
    kind: 'PARTNER_SETTLEMENT',
    label: 'Partner settlements',
    sheetNameHints: ['sama'],
    defaultHeaderRow: 2,
    masterField: 'description',
    serviceFields: ['amount'],
    columns: [
      { column: 'A', field: 'description', header: '', kind: 'text' },
      { column: 'D', field: 'amount', header: '', kind: 'money' },
      { column: 'H', field: 'extra1', header: '', kind: 'text' },
      { column: 'J', field: 'extra2', header: '', kind: 'text' },
      { column: 'L', field: 'extra3', header: '', kind: 'text' },
    ],
  },
];

export function profileFor(kind: SheetKind): SheetProfile | undefined {
  return SHEET_PROFILES.find((p) => p.kind === kind);
}

/** Maps a column's declared kind to the issue category its parser can raise. */
export const KIND_TO_ISSUE_CATEGORY: Record<ColumnSpec['kind'], DataQualityCategory> = {
  text: DataQualityCategory.AMBIGUOUS_VALUE,
  date: DataQualityCategory.DATE_ERROR,
  time: DataQualityCategory.TIME_PARSE_ERROR,
  money: DataQualityCategory.MONEY_PARSE_ERROR,
  count: DataQualityCategory.AMBIGUOUS_VALUE,
  phone: DataQualityCategory.PHONE_PARSE_ERROR,
};
