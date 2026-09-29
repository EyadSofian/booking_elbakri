'use client';

import { Check, ChevronDown } from 'lucide-react';
import { STATUSES, type EntityType, type Status } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { STATUS_STYLE } from '@/components/ui/badge';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu';

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', STATUS_STYLE[status].dot, className)} aria-hidden />;
}

export function StatusBadge({ status, type, className }: { status: Status; type?: EntityType; className?: string }) {
  const { statusLabel } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.72rem] font-medium leading-4',
        STATUS_STYLE[status].chip,
        className,
      )}
    >
      <StatusDot status={status} />
      {statusLabel(status, type)}
    </span>
  );
}

/**
 * The status as a button: click it anywhere — a list row, a card, a detail
 * panel — and pick the new status. Any status can go to any other.
 */
export function StatusMenu({
  status,
  type,
  onChange,
  disabled,
  size = 'sm',
}: {
  status: Status;
  type?: EntityType;
  onChange: (status: Status) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const { t, statusLabel } = useI18n();
  if (disabled) return <StatusBadge status={status} type={type} />;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-shadow',
            'hover:ring-2 hover:ring-foreground/10 focus-visible:ring-2 data-[state=open]:ring-2 data-[state=open]:ring-foreground/15',
            size === 'sm' ? 'px-2 py-0.5 text-[0.72rem] leading-4' : 'px-3 py-1 text-sm',
            STATUS_STYLE[status].chip,
          )}
          aria-label={`${t.ops.changeStatus}: ${statusLabel(status, type)}`}
        >
          <StatusDot status={status} />
          {statusLabel(status, type)}
          <ChevronDown className="size-3 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <MenuLabel>{t.ops.changeStatus}</MenuLabel>
        {STATUSES.map((s) => (
          <MenuItem key={s} onSelect={() => s !== status && onChange(s)} className="gap-2.5">
            <StatusDot status={s} className="size-2" />
            <span className="flex-1">
              <span className="block">{statusLabel(s, type)}</span>
              <span className="block text-2xs text-muted-foreground">{t.statusHint[s]}</span>
            </span>
            {s === status ? <Check className="text-primary" /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** Status as a row of chips inside a form (five choices — all visible at once). */
export function StatusPicker({
  value,
  onChange,
  type,
  name = 'status',
}: {
  value: Status;
  onChange: (s: Status) => void;
  type?: EntityType;
  name?: string;
}) {
  const { statusLabel } = useI18n();
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {STATUSES.map((s) => {
        const on = s === value;
        return (
          <label
            key={s}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              on ? cn(STATUS_STYLE[s].chip, 'border-transparent') : 'border-input bg-surface text-muted-foreground hover:text-foreground',
            )}
          >
            <input type="radio" name={name} value={s} checked={on} onChange={() => onChange(s)} className="sr-only" />
            <StatusDot status={s} />
            {statusLabel(s, type)}
          </label>
        );
      })}
    </div>
  );
}
