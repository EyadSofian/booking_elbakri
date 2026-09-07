'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DataQualityCategory, DataQualitySeverity, DataQualityStatus,
  PERMISSIONS, type PaginatedResponse,
} from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, severityVariant, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/data/stat-card';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface IssueRow {
  id: string;
  category: string;
  severity: string;
  status: string;
  entityType: string | null;
  entityId: string | null;
  field: string | null;
  rawValue: string | null;
  message: string;
  suggestion: string | null;
  sourceWorkbook: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  assignedTo: { id: string; fullName: string } | null;
  resolvedBy: { id: string; fullName: string } | null;
}

interface Summary {
  openTotal: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export default function DataQualityPage() {
  const { t, errorMessage, locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'createdAt', sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [acting, setActing] = useState<{ row: IssueRow; mode: 'resolve' | 'ignore' } | null>(null);

  const summary = useQuery({
    queryKey: ['data-quality', 'summary'],
    queryFn: () => api.get<Summary>('/data-quality/summary'),
  });

  const query = useQuery({
    queryKey: ['data-quality', state],
    queryFn: () =>
      api.get<PaginatedResponse<IssueRow>>('/data-quality', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['data-quality'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const act = useMutation({
    mutationFn: (body: { id: string; status: string; notes: string }) =>
      api.post(`/data-quality/${body.id}/resolve`, {
        status: body.status,
        resolutionNotes: body.notes,
      }),
    onSuccess: () => {
      toast.success(t.dataQuality.resolve);
      setActing(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reopen = useMutation({
    mutationFn: (id: string) => api.post(`/data-quality/${id}/reopen`),
    onSuccess: () => { toast.success(t.dataQuality.reopen); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const canResolve = can(PERMISSIONS.DATA_QUALITY_RESOLVE);

  const columns: Column<IssueRow>[] = [
    {
      key: 'severity', header: t.dataQuality.severity, sortKey: 'severity',
      alwaysVisible: true, mobile: 'hidden',
      cell: (row) => (
        <Badge variant={severityVariant(row.severity)}>
          {t.severity[row.severity as keyof typeof t.severity] ?? row.severity}
        </Badge>
      ),
    },
    {
      key: 'message', header: t.dataQuality.issue, mobile: 'title',
      cell: (row) => <span className="block max-w-96 truncate">{row.message}</span>,
    },
    {
      key: 'category', header: t.dataQuality.category, sortKey: 'category', mobile: 'subtitle',
      cell: (row) => (
        <span className="text-xs">
          {t.issueCategory[row.category as keyof typeof t.issueCategory] ?? row.category}
        </span>
      ),
    },
    {
      key: 'rawValue', header: t.dataQuality.rawValue,
      cell: (row) =>
        row.rawValue ? (
          // The original cell text, never rewritten.
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-2xs">
            {row.rawValue.length > 32 ? `${row.rawValue.slice(0, 32)}…` : row.rawValue}
          </code>
        ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'source', header: t.dataQuality.sourceRow,
      cell: (row) =>
        row.sourceSheet ? (
          <span className="whitespace-nowrap text-2xs text-muted-foreground">
            {row.sourceSheet} · {row.sourceRow}
          </span>
        ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'field', header: t.common.name, defaultHidden: true,
      cell: (row) => row.field ?? '—',
    },
    {
      key: 'assignedTo', header: t.dataQuality.assignedTo, defaultHidden: true,
      cell: (row) => row.assignedTo?.fullName ?? '—',
    },
    {
      key: 'createdAt', header: t.common.date, sortKey: 'createdAt', defaultHidden: true,
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.createdAt, locale)}</span>
      ),
    },
    {
      key: 'status', header: t.common.status, sortKey: 'status',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
          </Badge>
          {row.resolutionNotes ? (
            <span className="max-w-32 truncate text-2xs text-muted-foreground" title={row.resolutionNotes}>
              {row.resolutionNotes}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions', header: t.common.actions, mobile: 'hidden',
      cell: (row) => {
        if (!canResolve) return null;
        const open = row.status === 'OPEN' || row.status === 'REVIEWING';
        return (
          <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {open ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setActing({ row, mode: 'resolve' })}>
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  <span className="hidden lg:inline">{t.dataQuality.resolve}</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setActing({ row, mode: 'ignore' })}>
                  <EyeOff className="size-3.5" aria-hidden />
                  <span className="hidden lg:inline">{t.dataQuality.ignore}</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => reopen.mutate(row.id)}>
                <RotateCcw className="size-3.5" aria-hidden />
                <span className="hidden lg:inline">{t.dataQuality.reopen}</span>
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  const topCategories = Object.entries(summary.data?.byCategory ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={t.dataQuality.title}
        description={
          summary.data ? `${summary.data.openTotal} ${t.dataQuality.openIssues.toLowerCase()}` : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label={t.dataQuality.openIssues}
          value={summary.data?.openTotal ?? 0}
          loading={summary.isLoading}
        />
        <StatCard
          label={t.severity.ERROR}
          value={summary.data?.bySeverity?.ERROR ?? 0}
          tone="danger"
          loading={summary.isLoading}
          href="/data-quality?severity=ERROR"
        />
        <StatCard
          label={t.severity.WARNING}
          value={summary.data?.bySeverity?.WARNING ?? 0}
          tone="warning"
          loading={summary.isLoading}
          href="/data-quality?severity=WARNING"
        />
        <StatCard
          label={t.severity.INFO}
          value={summary.data?.bySeverity?.INFO ?? 0}
          tone="info"
          loading={summary.isLoading}
          href="/data-quality?severity=INFO"
        />
      </div>

      {topCategories.length ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {topCategories.map(([category, count]) => (
            <button
              key={category}
              type="button"
              onClick={() => update({ category })}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                state.filters.category === category
                  ? 'border-brand-300 bg-accent font-medium'
                  : 'bg-surface text-muted-foreground hover:bg-accent/40',
              )}
            >
              {t.issueCategory[category as keyof typeof t.issueCategory] ?? category}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

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
        emptyMessage={t.dataQuality.noIssues}
        mobileBadge={(row) => (
          <Badge variant={severityVariant(row.severity)}>
            {t.severity[row.severity as keyof typeof t.severity] ?? row.severity}
          </Badge>
        )}
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

            <select
              value={state.filters.status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
              aria-label={t.common.status}
            >
              <option value="">{t.common.status}: {t.common.all}</option>
              {Object.values(DataQualityStatus).map((s) => (
                <option key={s} value={s}>{t.status[s as keyof typeof t.status] ?? s}</option>
              ))}
            </select>

            <select
              value={state.filters.severity ?? ''}
              onChange={(e) => update({ severity: e.target.value || undefined })}
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
              aria-label={t.dataQuality.severity}
            >
              <option value="">{t.dataQuality.severity}: {t.common.all}</option>
              {Object.values(DataQualitySeverity).map((s) => (
                <option key={s} value={s}>{t.severity[s as keyof typeof t.severity] ?? s}</option>
              ))}
            </select>

            <select
              value={state.filters.category ?? ''}
              onChange={(e) => update({ category: e.target.value || undefined })}
              className="hidden h-8 rounded-md border border-input bg-surface px-2 text-xs lg:block"
              aria-label={t.dataQuality.category}
            >
              <option value="">{t.dataQuality.category}: {t.common.all}</option>
              {Object.values(DataQualityCategory).map((c) => (
                <option key={c} value={c}>
                  {t.issueCategory[c as keyof typeof t.issueCategory] ?? c}
                </option>
              ))}
            </select>

            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                <X className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.clearFilters}</span>
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog open={Boolean(acting)} onOpenChange={(open) => !open && setActing(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {acting?.mode === 'ignore' ? t.dataQuality.ignore : t.dataQuality.resolve}
            </DialogTitle>
          </DialogHeader>
          {acting ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                act.mutate({
                  id: acting.row.id,
                  status: acting.mode === 'ignore' ? 'IGNORED_WITH_REASON' : 'RESOLVED',
                  notes: String(form.get('notes')),
                });
              }}
            >
              <DialogBody className="space-y-3">
                <div className="rounded-md bg-surface-muted p-3">
                  <p className="text-xs">{acting.row.message}</p>
                  {acting.row.rawValue ? (
                    <p className="mt-1.5 font-mono text-2xs text-muted-foreground">
                      {t.dataQuality.rawValue}: {acting.row.rawValue}
                    </p>
                  ) : null}
                  {acting.row.sourceSheet ? (
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {acting.row.sourceWorkbook} · {acting.row.sourceSheet} ·{' '}
                      {t.dataQuality.sourceRow} {acting.row.sourceRow}
                    </p>
                  ) : null}
                </div>

                {acting.row.suggestion ? (
                  <p className="text-2xs text-muted-foreground">
                    <span className="font-medium">{t.dataQuality.suggestion}:</span>{' '}
                    {acting.row.suggestion}
                  </p>
                ) : null}

                <div className="space-y-1.5">
                  {/*
                    Ignoring requires a reason: closing something without saying
                    why is how a data problem quietly becomes folklore.
                  */}
                  <Label htmlFor="notes" required={acting.mode === 'ignore'}>
                    {t.dataQuality.resolutionNotes}
                  </Label>
                  <Textarea
                    id="notes" name="notes" rows={3}
                    required={acting.mode === 'ignore'}
                    minLength={acting.mode === 'ignore' ? 3 : undefined}
                    placeholder={acting.mode === 'ignore' ? t.dataQuality.ignoreReasonRequired : undefined}
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setActing(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={act.isPending}>
                  {acting.mode === 'ignore' ? t.dataQuality.ignore : t.dataQuality.resolve}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
