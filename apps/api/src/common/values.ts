import { Prisma } from '@prisma/client';
import { round2 } from '@elbakri/shared';

/**
 * Conversions at the database boundary.
 *
 * Calendar dates (check-in, travel date…) are stored as DATE and exchanged as
 * plain `YYYY-MM-DD` strings, so a date never shifts by a day because of a
 * timezone. Money is DECIMAL in the database and a plain number in JSON.
 */

export function toDbDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function fromDbDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function num(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return round2(Number(value));
}

export function num0(value: Prisma.Decimal | number | null | undefined): number {
  return num(value) ?? 0;
}

/** Today's date (YYYY-MM-DD) in the business timezone, not the server's. */
export function todayIn(timeZone: string, offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalises free text for storage: trimmed, inner whitespace collapsed, '' → null. */
export function clean(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = value.replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

/** HH:mm, or null. Accepts "9:30", "09:30", "0930". */
export function cleanTime(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  const m = value.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return value.trim();
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return value.trim();
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
