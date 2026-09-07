import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Renders minutes-since-midnight as HH:mm. */
export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats a stored calendar date.
 *
 * Service dates are stored at UTC midnight, so they are read back in UTC —
 * formatting them in the browser's zone would shift a booking by a day for
 * anyone west of Greenwich.
 */
export function formatDate(
  value: string | Date | null | undefined,
  locale = 'en',
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit' },
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    ...opts,
    timeZone: 'UTC',
    // Western digits in both languages so figures align in tables.
    numberingSystem: 'latn',
  }).format(date);
}

/** Formats a timestamp in the viewer's local zone (audit entries, sign-ins). */
export function formatDateTime(value: string | Date | null | undefined, locale = 'en'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    numberingSystem: 'latn',
  }).format(date);
}

export function formatMoney(
  value: number | string | null | undefined,
  currency = 'EGP',
  locale = 'en',
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    style: 'currency',
    currency,
    numberingSystem: 'latn',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(value: number | null | undefined, locale = 'en'): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    numberingSystem: 'latn',
  }).format(value);
}

/** Today as YYYY-MM-DD in UTC, matching how service dates are stored. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Debounce, used by search inputs so typing does not fire a query per keystroke. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
