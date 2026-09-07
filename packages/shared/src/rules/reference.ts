/** Trip file reference: EB-YYYY-NNNNNN. */
export const TRIP_REFERENCE_PREFIX = 'EB';

export function formatTripReference(year: number, sequence: number): string {
  return `${TRIP_REFERENCE_PREFIX}-${year}-${String(sequence).padStart(6, '0')}`;
}

export function formatDocumentReference(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

export const REFERENCE_PREFIXES = {
  TRIP: 'EB',
  HOTEL_BOOKING: 'HB',
  TRANSFER: 'TR',
  EXCURSION: 'EX',
  VISA: 'VS',
  PAYABLE: 'PAY',
  RECEIVABLE: 'REC',
  PAYMENT: 'PMT',
  SETTLEMENT: 'STL',
} as const;
