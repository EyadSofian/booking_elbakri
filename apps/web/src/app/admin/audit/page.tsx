'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** As returned by `GET /audit`. */
interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
  actorLabel: string | null;
}

/**
 * The fields an entry actually changed.
 *
 * The API stores the before and after snapshots rather than a field list, so
 * the difference is derived here — from the data, not from an assumption that
 * the server sends one.
 */
function changedFields(row: AuditRow): string[] {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (k) => JSON.stringify(before[k as keyof typeof before]) !== JSON.stringify(after[k as keyof typeof after]),
  );
}

export default function AuditPage() {
  const { t, locale } = useI18n();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'createdAt', sortDir: 'desc', pageSize: 50,
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['audit', state],
    queryFn: () =>
      api.get<PaginatedResponse<AuditRow>>('/audit', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<AuditRow>[] = [
    {
      key: 'createdAt', header: t.common.date, sortKey: 'createdAt',
      alwaysVisible: true, mobile: 'subtitle',
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.createdAt, locale)}</span>
      ),
    },
    {
      key: 'actor', header: t.audit.actor, mobile: 'field',
      cell: (row) => (
        <span className="block max-w-40 truncate">
          {row.actor?.fullName ?? row.actorLabel ?? 'System'}
        </span>
      ),
    },
    {
      key: 'action', header: t.audit.action, sortKey: 'action', mobile: 'title',
      cell: (row) => <Badge variant="outline" className="font-mono">{row.action}</Badge>,
    },
    {
      key: 'entity', header: t.audit.entity,
      cell: (row) => (
        <span className="text-2xs text-muted-foreground">
          {row.entityType ?? '—'}
          {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
        </span>
      ),
    },
    {
      key: 'changedFields', header: t.audit.changedFields,
      cell: (row) => {
        const fields = changedFields(row);
        if (!fields.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {fields.slice(0, 4).map((f) => (
              <Badge key={f} variant="default" className="font-mono">{f}</Badge>
            ))}
            {fields.length > 4 ? (
              <span className="text-2xs text-muted-foreground">+{fields.length - 4}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'expand', header: '', mobile: 'hidden',
      cell: (row) => {
        const isOpen = expanded === row.id;
        return (
          <Button
            variant="ghost" size="icon-sm"
            onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : row.id); }}
            aria-label={isOpen ? t.common.showLess : t.common.showMore}
          >
            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5 flip-rtl" />}
          </Button>
        );
      },
    },
  ];

  const openRow = (query.data?.data ?? []).find((r) => r.id === expanded);

  return (
    <>
      <PageHeader
        title={t.audit.title}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSortChange={(sortBy, sortDir) => update({ sortBy, sortDir })}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRefresh={() => query.refetch()}
        emptyMessage={t.audit.noHistory}
        toolbar={
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); update({ q: searchInput }); }}
              className="relative min-w-0 flex-1 sm:max-w-xs"
            >
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.common.search}
                className="h-8 ps-8 text-xs"
              />
            </form>
            <Input
              placeholder={t.audit.entity}
              value={state.filters.entityType ?? ''}
              onChange={(e) => update({ entityType: e.target.value || undefined })}
              className="h-8 w-40 text-xs"
            />
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                <X className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.clearFilters}</span>
              </Button>
            ) : null}
          </>
        }
      />

      {openRow ? (
        <div className="mt-3 rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs font-medium">
            {openRow.action}
            {openRow.requestId ? (
              <span className="ms-2 font-mono text-2xs text-muted-foreground">
                {t.audit.requestId}: {openRow.requestId}
              </span>
            ) : null}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
                {t.audit.before}
              </p>
              <pre className="max-h-64 overflow-auto rounded bg-surface-muted p-2 text-2xs" dir="ltr">
                {JSON.stringify(openRow.before ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
                {t.audit.after}
              </p>
              <pre className="max-h-64 overflow-auto rounded bg-surface-muted p-2 text-2xs" dir="ltr">
                {JSON.stringify(openRow.after ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
