'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import type { EntityType, Status } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/status';
import { DateText, RefTag, Txt } from '@/components/shared/format';

interface Hit {
  type: EntityType;
  id: string;
  ref: string;
  title: string;
  subtitle: string | null;
  date: string | null;
  status: Status;
}

export const ENTITY_ROUTE: Record<EntityType, (id: string) => string> = {
  SALE: (id) => `/sales/${id}`,
  HOTEL: (id) => `/hotels?open=${id}`,
  TRANSFER: (id) => `/transfers?open=${id}`,
  EXCURSION: (id) => `/excursions?open=${id}`,
  VISA: (id) => `/visas?open=${id}`,
};

/** One box that finds any booking — press ⌘K / Ctrl K from anywhere. */
export function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(timer);
  }, [q]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const search = useQuery({
    queryKey: ['/search', debounced],
    queryFn: () => api.get<Hit[]>('/search', { q: debounced }),
    enabled: debounced.length >= 2,
  });
  const hits = debounced.length >= 2 ? search.data ?? [] : [];
  React.useEffect(() => setActive(0), [debounced]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ('');
    router.push(ENTITY_ROUTE[hit.type](hit.id));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-input bg-surface px-3 text-start text-sm text-muted-foreground shadow-xs transition-colors hover:border-foreground/25"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">{t.nav.searchPlaceholder}</span>
        <kbd className="ms-auto hidden rounded border bg-surface-muted px-1.5 font-mono text-[0.65rem] sm:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="overflow-hidden sm:top-[12vh] sm:translate-y-0" closeLabel={t.common.close}>
          <DialogTitle className="sr-only">{t.common.search}</DialogTitle>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, hits.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter' && hits[active]) {
                  e.preventDefault();
                  go(hits[active]);
                }
              }}
              placeholder={t.nav.searchPlaceholder}
              className="h-14 w-full bg-transparent pe-8 text-[0.95rem] outline-none placeholder:text-muted-foreground/70"
            />
            {search.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <ul className="scroll-thin max-h-[60dvh] overflow-y-auto p-2">
            {hits.map((h, i) => (
              <li key={`${h.type}-${h.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start', i === active && 'bg-accent')}
                >
                  <RefTag value={h.ref} className="w-16 justify-center" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      <Txt>{h.title}</Txt>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.entity[h.type]}
                      {h.subtitle ? <> · <Txt>{h.subtitle}</Txt></> : ''}
                    </span>
                  </span>
                  <DateText value={h.date} className="hidden text-xs text-muted-foreground sm:inline" />
                  <StatusBadge status={h.status} type={h.type} />
                </button>
              </li>
            ))}
            {debounced.length >= 2 && !search.isFetching && !hits.length ? (
              <li className="px-3 py-10 text-center text-sm text-muted-foreground">{t.nav.searchEmpty}</li>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
