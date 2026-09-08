'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn, debounce } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export interface PickableRecord {
  id: string;
  name?: string | null;
  nameAr?: string | null;
  fullName?: string | null;
  reference?: string | null;
  region?: string | null;
  city?: string | null;
  hotelGroupName?: string | null;
  starRating?: number | null;
  phoneRaw?: string | null;
  phoneNormalized?: string | null;
  [key: string]: unknown;
}

/**
 * A searchable picker over any master-data or record endpoint.
 *
 * A native `<select>` stops working once a list runs to hundreds of entries and
 * cannot search at all — which matters most here, because people search by the
 * spelling they remember rather than the canonical one. Search runs on the
 * server, so the whole catalogue never has to be in the browser.
 */
export function EntityPicker({
  resource,
  value,
  onChange,
  /** Shown when the current value is not in the visible page of results. */
  currentLabel,
  placeholder,
  disabled,
  required,
  id,
  className,
  /** Extra query parameters, e.g. `{ kind: 'AIRPORT' }`. */
  params,
}: {
  resource: string;
  value: string | null;
  onChange: (id: string | null, record: PickableRecord | null) => void;
  currentLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  params?: Record<string, string | undefined>;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<PickableRecord | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const setSearchDebounced = useMemo(() => debounce((v: string) => setSearch(v), 220), []);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const options = useQuery({
    queryKey: ['entity-picker', resource, search, params],
    queryFn: async () => {
      const r = await api.get<PaginatedResponse<PickableRecord> | PickableRecord[]>(resource, {
        q: search || undefined,
        pageSize: 25,
        ...params,
      });
      return Array.isArray(r) ? r : r.data;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const label = (record: PickableRecord): string =>
    ((locale === 'ar' && record.nameAr) || record.name || record.fullName || record.reference) ??
    '—';

  const subtitle = (record: PickableRecord): string =>
    [
      record.hotelGroupName,
      record.region ?? record.city,
      record.phoneNormalized ?? record.phoneRaw,
    ]
      .filter(Boolean)
      .join(' · ');

  // Prefer the record actually chosen; fall back to a label supplied by the
  // caller, so an existing value shows even before any search has run.
  const selectedLabel =
    picked && picked.id === value ? label(picked) : (currentLabel ?? null);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input',
          'bg-surface px-3 py-2 text-sm shadow-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={cn('truncate text-start', !selectedLabel && 'text-muted-foreground')}>
          {selectedLabel ?? placeholder ?? t.common.search}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t.common.clearFilters}
              onClick={(e) => {
                e.stopPropagation();
                setPicked(null);
                onChange(null, null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setPicked(null);
                  onChange(null, null);
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </span>
          ) : null}
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-overlay">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setSearchDebounced(e.target.value);
              }}
              autoFocus
              autoComplete="off"
              placeholder={t.common.search}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <ul role="listbox" className="max-h-60 overflow-y-auto p-1">
            {options.isFetching ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t.common.loading}
              </li>
            ) : (options.data?.length ?? 0) === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t.common.noResults}
              </li>
            ) : (
              options.data!.map((record) => {
                const isSelected = record.id === value;
                const sub = subtitle(record);
                return (
                  <li key={record.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setPicked(record);
                        onChange(record.id, record);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start',
                        'transition-colors hover:bg-accent/50',
                        isSelected && 'bg-accent',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{label(record)}</span>
                        {sub ? (
                          <span className="block truncate text-2xs text-muted-foreground" dir="auto">
                            {sub}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {record.starRating ? (
                          <Badge variant="outline">{record.starRating}★</Badge>
                        ) : null}
                        {isSelected ? <Check className="size-3.5" aria-hidden /> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
