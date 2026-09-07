import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * A single operational figure.
 *
 * Deliberately plain: these are numbers a coordinator scans in a second, so
 * the value carries the emphasis and nothing competes with it.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  href,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  href?: string;
  loading?: boolean;
}) {
  const toneClasses = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-16" />
      ) : (
        <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums leading-none', toneClasses)}>
          {value}
        </p>
      )}
      {hint ? <p className="mt-1.5 text-2xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  const className = cn(
    'rounded-lg border bg-card p-3 shadow-xs transition-colors',
    href && 'hover:border-brand-300 hover:bg-accent/30',
  );

  if (href) {
    return (
      <Link href={href} className={cn(className, 'block')}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
