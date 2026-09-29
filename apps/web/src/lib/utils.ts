import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const intlLocale = (locale: string) => (locale === 'ar' ? 'ar-EG' : 'en-GB');

/**
 * Formats a calendar date sent by the API as YYYY-MM-DD.
 *
 * Read in UTC so a booking never shifts by a day in the viewer's timezone, and
 * always with Western digits so figures line up in both languages.
 */
export function formatDate(
  value: string | null | undefined,
  locale = 'ar',
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: 'UTC', numberingSystem: 'latn' }).format(date);
}

/** "12 Oct" — the year is dropped when it is the current one. */
export function formatShortDate(value: string | null | undefined, locale = 'ar'): string {
  if (!value) return '—';
  const sameYear = value.slice(0, 4) === String(new Date().getFullYear());
  return formatDate(value, locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A moment in time (history entries), shown in the viewer's own timezone. */
export function formatDateTime(value: string | null | undefined, locale = 'ar'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', numberingSystem: 'latn',
  }).format(date);
}

export function formatNumber(value: number | null | undefined, locale = 'ar', digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits, numberingSystem: 'latn' }).format(value);
}

/** Today's date (YYYY-MM-DD) in Cairo, which is the business day. */
export function todayIso(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthRange(offset = 0): { from: string; to: string } {
  const today = todayIso();
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  const from = d.toISOString().slice(0, 10);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from, to: d.toISOString().slice(0, 10) };
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/** Removes empty values so they are not sent as query parameters. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;
}
