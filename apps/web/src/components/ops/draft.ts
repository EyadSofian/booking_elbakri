'use client';

import * as React from 'react';
import type { CurrencyCode, Status } from '@elbakri/shared';

/**
 * Form state for a booking: every input is a string ('' means empty), turned
 * into the API payload only when saving. Keeps the forms dumb and predictable.
 */
export type Draft = Record<string, string>;

export function useDraft(initial: Draft) {
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [baseline, setBaseline] = React.useState<string>(() => JSON.stringify(initial));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = React.useCallback((key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // Editing a field clears its error straight away.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  }, []);

  const reset = React.useCallback((next: Draft) => {
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
  }, []);

  return {
    draft,
    set,
    reset,
    errors,
    setErrors,
    dirty: JSON.stringify(draft) !== baseline,
  };
}

export const str = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s ? s : null;
};

export const num = (v: string | undefined): number | null => {
  const s = (v ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export const int = (v: string | undefined): number | null => {
  const n = num(v);
  return n === null ? null : Math.max(0, Math.round(n));
};

export const toStr = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

export const asStatus = (v: string | undefined): Status => (v || 'NEW') as Status;
export const asCurrency = (v: string | undefined, fallback: CurrencyCode = 'EGP'): CurrencyCode => (v || fallback) as CurrencyCode;
