'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn, compact } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Search as you type — the query runs a moment after the last keystroke. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-surface ps-9 pe-8 text-sm shadow-xs transition-colors',
          'placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="clear"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t, dir } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
      <span className="tabular">{t.common.pageOf(page, pages)}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={t.common.previous}>
          <Prev />
          <span className="hidden sm:inline">{t.common.previous}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label={t.common.next}>
          <span className="hidden sm:inline">{t.common.next}</span>
          <Next />
        </Button>
      </div>
    </div>
  );
}

/** Downloads exactly what the list is showing (same filters) as an Excel sheet. */
export function ExportButton({ endpoint, params }: { endpoint: string; params: Record<string, unknown> }) {
  const { t, errorMessage } = useI18n();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      title={t.common.exportTitle}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { page: _page, pageSize: _size, ...filters } = params;
          await api.download(`${endpoint}/export`, compact(filters));
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? null : <Download />}
      <span className="hidden sm:inline">{t.common.export}</span>
    </Button>
  );
}
