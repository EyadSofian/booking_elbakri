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

export interface HotelOption {
  id: string;
  name: string;
  nameAr: string | null;
  region: string | null;
  city: string | null;
  hotelGroupName: string | null;
  starRating: number | null;
  isActive: boolean;
  aliases?: Array<{ id: string; alias: string }>;
}

/**
 * Searchable hotel picker.
 *
 * A native select is unusable once the catalogue runs to hundreds of hotels,
 * and it cannot search by the spelling someone actually remembers. This
 * searches the synchronised local catalogue — canonical name, approved alias,
 * group and region — rather than calling the Rate Hub on every keystroke.
 *
 * Only selectable hotels are offered. A record that already references an
 * inactive hotel still displays it, because history must keep its hotel.
 */
export function HotelPicker({
  value,
  onChange,
  /** Shown when the current value is an inactive hotel no longer offered. */
  currentLabel,
  placeholder,
  disabled,
  id,
  className,
}: {
  value: string | null;
  onChange: (hotelId: string | null, hotel: HotelOption | null) => void;
  currentLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
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
    queryKey: ['hotel-picker', search],
    queryFn: async () => {
      const r = await api.get<PaginatedResponse<HotelOption> | HotelOption[]>('/hotels', {
        q: search || undefined,
        pageSize: 25,
      });
      return Array.isArray(r) ? r : r.data;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const selected = options.data?.find((h) => h.id === value);
  const label = selected
    ? (locale === 'ar' && selected.nameAr) || selected.name
    : currentLabel ?? null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input',
          'bg-surface px-3 py-2 text-sm shadow-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={cn('truncate text-start', !label && 'text-muted-foreground')}>
          {label ?? placeholder ?? t.hotels.hotel}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t.common.clearFilters}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
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
              placeholder={`${t.common.search} — ${t.masterData.alias}, ${t.hotelDirectory.region}`}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
            {options.isFetching ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t.common.loading}
              </li>
            ) : (options.data?.length ?? 0) === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t.common.noResults}
              </li>
            ) : (
              options.data!.map((hotel) => {
                const isSelected = hotel.id === value;
                return (
                  <li key={hotel.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(hotel.id, hotel);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start',
                        'transition-colors hover:bg-accent/50',
                        isSelected && 'bg-accent',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {(locale === 'ar' && hotel.nameAr) || hotel.name}
                        </span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {[hotel.hotelGroupName, hotel.region ?? hotel.city]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {hotel.starRating ? (
                          <Badge variant="outline">{hotel.starRating}★</Badge>
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
