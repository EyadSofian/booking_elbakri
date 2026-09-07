'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Building2, CarFront, ClipboardList, Globe2, Hotel, Loader2, Receipt,
  Search, Ship, Sparkles, Users,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn, debounce } from '@/lib/utils';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  href: string;
}

const ICONS: Record<string, typeof Search> = {
  TRIP: ClipboardList,
  TRAVELER: Users,
  HOTEL_BOOKING: Hotel,
  TRANSFER: CarFront,
  EXCURSION: Ship,
  VISA: Globe2,
  HOTEL: Building2,
  PARTNER: Sparkles,
  PAYABLE: Receipt,
};

const GROUP_ORDER = [
  'TRIP', 'TRAVELER', 'HOTEL_BOOKING', 'TRANSFER',
  'EXCURSION', 'VISA', 'PAYABLE', 'HOTEL', 'PARTNER',
];

/**
 * The Cmd/Ctrl+K palette.
 *
 * Results come from the API, which filters them by the caller's permissions —
 * so the palette can never surface a record the user is not allowed to open.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t, dir } = useI18n();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  // Typing should not fire a request per keystroke.
  const setQueryDebounced = useMemo(() => debounce((v: string) => setQuery(v), 220), []);

  useEffect(() => {
    setQueryDebounced(input);
  }, [input, setQueryDebounced]);

  useEffect(() => {
    if (!open) {
      setInput('');
      setQuery('');
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get<SearchHit[]>('/search', { q: query, limit: 6 }),
    enabled: open && query.trim().length >= 2,
    staleTime: 15_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of data ?? []) {
      const list = map.get(hit.type) ?? [];
      list.push(hit);
      map.set(hit.type, list);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const);
  }, [data]);

  const groupLabel = (type: string): string => {
    switch (type) {
      case 'TRIP': return t.nav.tripFiles;
      case 'TRAVELER': return t.nav.travelers;
      case 'HOTEL_BOOKING': return t.nav.hotelBookings;
      case 'TRANSFER': return t.nav.transfers;
      case 'EXCURSION': return t.nav.excursions;
      case 'VISA': return t.nav.visas;
      case 'PAYABLE': return t.nav.payables;
      case 'HOTEL': return t.nav.hotels;
      case 'PARTNER': return t.nav.partners;
      default: return type;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-brand-950/50 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-label={t.common.close}
      />
      <div className="absolute inset-x-3 top-16 mx-auto max-w-2xl sm:inset-x-0">
        <Command
          dir={dir}
          shouldFilter={false}
          loop
          className="overflow-hidden rounded-lg border bg-popover shadow-overlay"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onOpenChange(false);
          }}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              value={input}
              onValueChange={setInput}
              autoFocus
              placeholder={t.common.searchPlaceholder}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
            {query.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t.common.searchPlaceholder}
              </p>
            ) : null}

            {query.trim().length >= 2 && !isFetching && grouped.length === 0 ? (
              <Command.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t.common.noResults}
              </Command.Empty>
            ) : null}

            {grouped.map(([type, hits]) => {
              const Icon = ICONS[type] ?? Search;
              return (
                <Command.Group
                  key={type}
                  heading={groupLabel(type)}
                  className={cn(
                    '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
                    '[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold',
                    '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide',
                    '[&_[cmdk-group-heading]]:text-muted-foreground',
                  )}
                >
                  {hits.map((hit) => (
                    <Command.Item
                      key={`${hit.type}-${hit.id}`}
                      value={`${hit.type}-${hit.id}`}
                      onSelect={() => {
                        onOpenChange(false);
                        router.push(hit.href);
                      }}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm',
                        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {hit.detail ? (
                        <span className="shrink-0 text-2xs text-muted-foreground">{hit.detail}</span>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
