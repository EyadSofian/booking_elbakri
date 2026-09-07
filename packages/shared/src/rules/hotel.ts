import { DataQualityCategory, DataQualitySeverity } from '../domain/enums';
import { MAX_PLAUSIBLE_YEAR, MIN_PLAUSIBLE_YEAR, nightsBetween } from '../parsers/date';

export interface HotelDateValidationInput {
  checkIn: Date | null;
  checkOut: Date | null;
  bookingDate?: Date | null;
}

export interface RuleViolation {
  code: string;
  category: DataQualityCategory;
  severity: DataQualitySeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface HotelDateValidationResult {
  nights: number | null;
  violations: RuleViolation[];
  /** True when the stay is valid enough to be saved as a live booking. */
  valid: boolean;
}

/**
 * Hotel stay date rules.
 *
 * A same-day or reversed stay is rejected for new bookings, but historical
 * imports keep the original values and raise an issue instead — the legacy file
 * is evidence and is never rewritten.
 */
export function validateHotelDates(input: HotelDateValidationInput): HotelDateValidationResult {
  const violations: RuleViolation[] = [];
  const { checkIn, checkOut, bookingDate } = input;

  if (!checkIn) {
    violations.push({
      code: 'MISSING_CHECK_IN',
      category: DataQualityCategory.MISSING_REQUIRED_VALUE,
      severity: DataQualitySeverity.ERROR,
      message: 'Check-in date is required.',
    });
  }
  if (!checkOut) {
    violations.push({
      code: 'MISSING_CHECK_OUT',
      category: DataQualityCategory.MISSING_REQUIRED_VALUE,
      severity: DataQualitySeverity.ERROR,
      message: 'Check-out date is required.',
    });
  }

  let nights: number | null = null;
  if (checkIn && checkOut) {
    nights = nightsBetween(checkIn, checkOut);
    if (nights < 0) {
      violations.push({
        code: 'CHECKOUT_BEFORE_CHECKIN',
        category: DataQualityCategory.DATE_ERROR,
        severity: DataQualitySeverity.ERROR,
        message: 'Check-out date is earlier than check-in date.',
        details: { checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString(), nights },
      });
    } else if (nights === 0) {
      violations.push({
        code: 'ZERO_NIGHT_STAY',
        category: DataQualityCategory.DATE_ERROR,
        severity: DataQualitySeverity.WARNING,
        message: 'Check-in and check-out fall on the same day (zero nights).',
        details: { checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString() },
      });
    }
  }

  if (bookingDate && checkIn && bookingDate.getTime() > checkIn.getTime()) {
    violations.push({
      code: 'BOOKING_DATE_AFTER_CHECKIN',
      category: DataQualityCategory.DATE_ERROR,
      severity: DataQualitySeverity.WARNING,
      message: 'Booking date is after the check-in date.',
      details: { bookingDate: bookingDate.toISOString(), checkIn: checkIn.toISOString() },
    });
  }

  for (const [field, value] of Object.entries({ checkIn, checkOut, bookingDate })) {
    if (!value) continue;
    const year = value.getUTCFullYear();
    if (year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR) {
      violations.push({
        code: 'SUSPICIOUS_YEAR',
        category: DataQualityCategory.SUSPICIOUS_YEAR,
        severity: DataQualitySeverity.WARNING,
        message: `The year on ${field} (${year}) is outside the plausible range ${MIN_PLAUSIBLE_YEAR}–${MAX_PLAUSIBLE_YEAR}.`,
        details: { field, year },
      });
    }
  }

  return {
    nights: nights !== null && nights >= 0 ? nights : nights,
    violations,
    valid: !violations.some((v) => v.severity === DataQualitySeverity.ERROR),
  };
}

/** Number of nights for a saved booking. Always derived, never stored as input. */
export function calculateNights(checkIn: Date, checkOut: Date): number {
  const n = nightsBetween(checkIn, checkOut);
  if (n < 0) throw new Error('CHECKOUT_BEFORE_CHECKIN');
  return n;
}
