'use client';

import type { CurrencyCode } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { cn, formatDate, formatNumber, formatShortDate, todayIso } from '@/lib/utils';

/** "12,500 EGP" — the currency is always shown; amounts in different currencies are never added up. */
export function Money({
  value,
  currency,
  className,
  muted,
  signed,
}: {
  value: number | null | undefined;
  currency: CurrencyCode;
  className?: string;
  muted?: boolean;
  /** Colours losses red and gains green. */
  signed?: boolean;
}) {
  const { t, locale } = useI18n();
  if (value === null || value === undefined) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        muted && 'text-muted-foreground',
        signed && value < 0 && 'text-danger',
        signed && value > 0 && 'text-success',
        className,
      )}
    >
      {formatNumber(value, locale)}
      <span className="ms-1 text-[0.8em] font-normal opacity-70">{t.currencies[currency]}</span>
    </span>
  );
}

/** A date, with "Today"/"Tomorrow" called out so nothing due is missed. */
export function DateText({ value, className, full }: { value: string | null | undefined; className?: string; full?: boolean }) {
  const { t, locale } = useI18n();
  if (!value) return <span className="text-muted-foreground/60">—</span>;
  const today = todayIso();
  const tomorrow = todayIso(1);
  const special = value === today ? t.common.today : value === tomorrow ? t.common.tomorrow : null;
  return (
    <span className={cn('tabular whitespace-nowrap', className)} title={formatDate(value, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      {special ? (
        <span className="me-1 rounded bg-sun-subtle px-1 py-px text-[0.7rem] font-semibold text-sun-foreground">{special}</span>
      ) : null}
      {full ? formatDate(value, locale) : formatShortDate(value, locale)}
    </span>
  );
}

export function RefTag({ value, className }: { value: string; className?: string }) {
  return <span className={cn('ref-tag', className)}>{value}</span>;
}

/** "2 + 1" adults and children, compact. */
export function Pax({ adults, kids }: { adults: number | null; kids: number | null }) {
  if (adults == null && !kids) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="tabular whitespace-nowrap">
      {adults ?? 0}
      {kids ? <span className="text-muted-foreground"> + {kids}</span> : null}
    </span>
  );
}

/** Text a person typed (names, hotels, notes) — keeps its own reading order. */
export function Txt({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('bidi', className)}>{children}</span>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
