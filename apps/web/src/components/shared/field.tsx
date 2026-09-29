'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/**
 * A labelled form field: label above, the control, then either a hint or the
 * error — linked to the control for screen readers.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const describedBy = htmlFor ? `${htmlFor}-desc` : undefined;
  const child = React.isValidElement(children) && describedBy && (hint || error)
    ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': describedBy })
    : children;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {child}
      {error ? (
        <p id={describedBy} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A titled group of fields inside a form. */
export function FormSection({
  title,
  hint,
  children,
  className,
  aside,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <fieldset className={cn('min-w-0 space-y-3', className)}>
      <div className="flex items-end justify-between gap-2">
        <legend className="text-[0.8rem] font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
        {aside}
      </div>
      {hint ? <p className="-mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/** A handful of choices shown as a row of pills (radio buttons underneath). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; count?: number | null }>;
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-[0.8rem]',
              on ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
            {o.count != null ? (
              <span className={cn('tabular rounded-full px-1.5 text-[0.68rem]', on ? 'bg-secondary text-foreground' : 'bg-surface/60')}>
                {o.count}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
