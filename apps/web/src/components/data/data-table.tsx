'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp,
  Columns3, Inbox, Loader2, RefreshCw,
} from 'lucide-react';
import type { PaginationMeta } from '@elbakri/shared';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/providers';
import { Button } from '@/components/ui/button';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Receives the row and returns anything renderable. */
  cell: (row: T) => ReactNode;
  /** Server-side sort key. Omit to make the column unsortable. */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** Hidden by default; the user can turn it on via the column menu. */
  defaultHidden?: boolean;
  /** Kept out of the column menu — an identity column the table needs. */
  alwaysVisible?: boolean;
  /**
   * How the column behaves in the mobile card view.
   * `title` and `subtitle` form the card head; `hidden` drops it entirely.
   */
  mobile?: 'title' | 'subtitle' | 'field' | 'hidden';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  meta?: PaginationMeta;
  loading?: boolean;
  error?: unknown;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh?: () => void;
  emptyMessage?: string;
  emptyHint?: string;
  toolbar?: ReactNode;
  /** Rendered above each mobile card, e.g. a status badge. */
  mobileBadge?: (row: T) => ReactNode;
}

const PAGE_SIZES = [25, 50, 100];

/**
 * The single data-grid foundation used by every list screen.
 *
 * Paging, sorting and filtering are all server-side — the table renders the
 * page it was given and asks for another. It never pulls the whole collection
 * down to filter it in the browser.
 *
 * Below `md` the same rows render as cards. A twelve-column grid squeezed into
 * 360px is unusable, and a transfer coordinator does read this on a phone.
 */
export function DataTable<T>({
  columns, rows, meta, loading, error, rowKey, onRowClick,
  sortBy, sortDir = 'desc', onSortChange, onPageChange, onPageSizeChange, onRefresh,
  emptyMessage, emptyHint, toolbar, mobileBadge,
}: DataTableProps<T>) {
  const { t, dir } = useI18n();
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  const visible = useMemo(
    () => columns.filter((c) => c.alwaysVisible || !hidden.has(c.key)),
    [columns, hidden],
  );

  const toggleColumn = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (column: Column<T>) => {
    if (!column.sortKey || !onSortChange) return;
    const nextDir = sortBy === column.sortKey && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange(column.sortKey, nextDir);
  };

  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm font-medium">{t.common.error}</p>
        {onRefresh ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
            <RefreshCw className="size-3.5" aria-hidden />
            {t.common.retry}
          </Button>
        ) : null}
      </div>
    );
  }

  const mobileTitle = columns.find((c) => c.mobile === 'title') ?? columns[0];
  const mobileSubtitle = columns.find((c) => c.mobile === 'subtitle');
  const mobileFields = visible.filter(
    (c) => c.mobile !== 'hidden' && c !== mobileTitle && c !== mobileSubtitle,
  );

  return (
    <div className="space-y-3">
      {(toolbar || onRefresh || columns.some((c) => !c.alwaysVisible)) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>

          {onRefresh ? (
            <Button variant="outline" size="icon-sm" onClick={onRefresh} aria-label={t.common.retry}>
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          ) : null}

          {columns.some((c) => !c.alwaysVisible) ? (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColumnMenuOpen((v) => !v)}
                aria-expanded={columnMenuOpen}
              >
                <Columns3 className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.columns}</span>
              </Button>
              {columnMenuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-30"
                    onClick={() => setColumnMenuOpen(false)}
                    aria-hidden
                    tabIndex={-1}
                  />
                  <div className="absolute end-0 top-full z-40 mt-1 w-56 rounded-md border bg-popover p-1 shadow-overlay">
                    {columns
                      .filter((c) => !c.alwaysVisible)
                      .map((c) => (
                        <label
                          key={c.key}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden.has(c.key)}
                            onChange={() => toggleColumn(c.key)}
                            className="size-3.5 accent-brand-700"
                          />
                          <span className="truncate">{c.header}</span>
                        </label>
                      ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Desktop / tablet: a real table, scrolling inside its own container. */}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {visible.map((column) => {
                  const sorted = sortBy === column.sortKey;
                  const SortIcon = !column.sortKey
                    ? null
                    : sorted
                      ? sortDir === 'asc'
                        ? ChevronUp
                        : ChevronDown
                      : ChevronsUpDown;
                  return (
                    <th
                      key={column.key}
                      className={column.headerClassName}
                      aria-sort={sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {column.sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {column.header}
                          {SortIcon ? (
                            <SortIcon
                              className={cn('size-3', sorted ? 'opacity-100' : 'opacity-40')}
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      {visible.map((column) => (
                        <td key={column.key}>
                          <div className="skeleton h-4 w-full max-w-40" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(onRowClick && 'cursor-pointer')}
                    >
                      {visible.map((column) => (
                        <td key={column.key} className={column.className}>
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!loading && rows.length === 0 ? (
          <EmptyState message={emptyMessage ?? t.common.noResults} hint={emptyHint ?? t.common.noResultsHint} />
        ) : null}
      </div>

      {/* Mobile: cards, so the important fields stay readable at 360px. */}
      <div className="space-y-2 md:hidden">
        {loading && rows.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={`m-skeleton-${i}`} className="rounded-lg border bg-card p-3">
                <div className="skeleton mb-2 h-4 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ))
          : rows.map((row) => (
              <button
                key={rowKey(row)}
                type="button"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'block w-full rounded-lg border bg-card p-3 text-start transition-colors',
                  onRowClick && 'hover:bg-accent/40 active:bg-accent/60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{mobileTitle?.cell(row)}</div>
                    {mobileSubtitle ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {mobileSubtitle.cell(row)}
                      </div>
                    ) : null}
                  </div>
                  {mobileBadge ? <div className="shrink-0">{mobileBadge(row)}</div> : null}
                </div>
                {mobileFields.length ? (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-2.5">
                    {mobileFields.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="truncate text-2xs uppercase tracking-wide text-muted-foreground">
                          {column.header}
                        </dt>
                        <dd className="truncate text-xs">{column.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </button>
            ))}

        {!loading && rows.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState message={emptyMessage ?? t.common.noResults} hint={emptyHint ?? t.common.noResultsHint} />
          </div>
        ) : null}
      </div>

      {meta && meta.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)}{' '}
              {t.common.of} {meta.total}
            </span>
            {onPageSizeChange ? (
              <label className="hidden items-center gap-1.5 sm:flex">
                <span>{t.common.rowsPerPage}</span>
                <select
                  value={meta.pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="h-7 rounded border border-input bg-surface px-1.5 text-xs"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {onPageChange ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!meta.hasPrevious || loading}
                onClick={() => onPageChange(meta.page - 1)}
                aria-label={t.common.previous}
              >
                <PrevIcon className="size-3.5" />
              </Button>
              <span className="px-2 tabular-nums">
                {meta.page} / {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!meta.hasNext || loading}
                onClick={() => onPageChange(meta.page + 1)}
                aria-label={t.common.next}
              >
                <NextIcon className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading && rows.length > 0 ? (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t.common.loading}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Inbox className="size-8 text-muted-foreground/50" aria-hidden />
      <p className="text-sm font-medium">{message}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
