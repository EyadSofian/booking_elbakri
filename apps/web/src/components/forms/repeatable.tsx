'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * A repeating group of form rows — stays, legs, activities, applicants.
 *
 * This shape is the whole point of the domain: one booking holds several stays,
 * one transfer holds an outbound and a return, one excursion order holds
 * several activities. It is exactly what the legacy sheets encoded with
 * blank-name continuation rows, so the form has to make adding another one
 * obvious rather than forcing a second booking.
 */
export function Repeatable<T>({
  items,
  onChange,
  makeEmpty,
  renderItem,
  addLabel,
  itemLabel,
  /** Below this, the remove control is hidden — a booking needs at least one. */
  minItems = 1,
  maxItems = 20,
  className,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  makeEmpty: () => T;
  renderItem: (item: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel: string;
  itemLabel: (index: number) => string;
  minItems?: number;
  maxItems?: number;
  className?: string;
}) {
  const { t } = useI18n();

  const update = (index: number) => (patch: Partial<T>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border bg-surface-muted/40 p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {itemLabel(index)}
            </span>
            {items.length > minItems ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(index)}
                aria-label={`${t.common.delete}: ${itemLabel(index)}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
          {renderItem(item, index, update(index))}
        </div>
      ))}

      {items.length < maxItems ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, makeEmpty()])}
        >
          <Plus className="size-3.5" aria-hidden />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** A labelled form field with consistent spacing. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-medium leading-none text-foreground"
      >
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {hint}
      </label>
      {children}
    </div>
  );
}

/** A titled block within a form, so a long form reads as sections not a wall. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
