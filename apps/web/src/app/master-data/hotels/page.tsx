'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, RefreshCw, Search, TriangleAlert, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelpNotice, HelpTip, DisabledReason } from '@/components/help/help-tip';

interface HotelRow {
  id: string;
  name: string;
  nameAr: string | null;
  hotelGroupName: string | null;
  region: string | null;
  subRegion: string | null;
  city: string | null;
  starRating: number | null;
  isActive: boolean;
  sourceSystem: string | null;
  externalId: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  aliases: Array<{ id: string; alias: string }>;
  _count?: { bookings: number; staySegments: number };
}

interface SyncStatus {
  source: string;
  configured: boolean;
  running: boolean;
  pricingImported: boolean;
  lastRun: {
    status: string;
    startedAt: string;
    finishedAt: string;
    received: number;
    created: number;
    updated: number;
    matched: number;
    needsReview: number;
    errors: string[];
  } | null;
}

const SYNC_VARIANT: Record<string, 'success' | 'warning' | 'default'> = {
  LINKED: 'success',
  NEEDS_MATCH: 'warning',
  LOCAL_ONLY: 'default',
};

function HotelsContent() {
  const router = useRouter();
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'name', sortDir: 'asc',
  });
  const [searchInput, setSearchInput] = useState(state.q);

  const canSync = can(PERMISSIONS.HOTELS_SYNC);

  const status = useQuery({
    queryKey: ['hotel-directory', 'status'],
    queryFn: () => api.get<SyncStatus>('/hotel-directory/status'),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const query = useQuery({
    queryKey: ['master-data', '/hotels', state],
    queryFn: async () => {
      const r = await api.get<PaginatedResponse<HotelRow> | HotelRow[]>('/hotels', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      });
      return Array.isArray(r)
        ? {
            data: r,
            meta: {
              page: 1, pageSize: r.length, total: r.length,
              totalPages: 1, hasNext: false, hasPrevious: false,
            },
          }
        : r;
    },
  });

  const sync = useMutation({
    mutationFn: (full: boolean) => api.post('/hotel-directory/sync', { full }),
    onSuccess: () => {
      toast.success(t.hotelDirectory.syncFinished);
      void queryClient.invalidateQueries({ queryKey: ['hotel-directory'] });
      void queryClient.invalidateQueries({ queryKey: ['master-data', '/hotels'] });
      void queryClient.invalidateQueries({ queryKey: ['alias-suggestions'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: Column<HotelRow>[] = [
    {
      key: 'name', header: t.hotels.hotel, sortKey: 'name',
      alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="block max-w-64 truncate font-medium">
          {(locale === 'ar' && row.nameAr) || row.name}
        </span>
      ),
    },
    {
      key: 'group', header: t.hotelDirectory.group, mobile: 'subtitle',
      cell: (row) => row.hotelGroupName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'region', header: t.hotelDirectory.region,
      cell: (row) => row.region ?? row.city ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'subRegion', header: t.hotelDirectory.subRegion, defaultHidden: true,
      cell: (row) => row.subRegion ?? '—',
    },
    {
      key: 'stars', header: t.hotelDirectory.stars, sortKey: 'starRating',
      cell: (row) => (row.starRating ? <span className="tabular-nums">{row.starRating}★</span> : '—'),
    },
    {
      key: 'aliases', header: t.masterData.aliases,
      cell: (row) => {
        const aliases = row.aliases ?? [];
        if (!aliases.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {aliases.slice(0, 2).map((a) => (
              <Badge key={a.id} variant="outline" className="font-mono">{a.alias}</Badge>
            ))}
            {aliases.length > 2 ? (
              <span className="text-2xs text-muted-foreground">+{aliases.length - 2}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'usage', header: t.hotelDirectory.bookingUsage,
      cell: (row) => (
        <span className="tabular-nums">{row._count?.bookings ?? 0}</span>
      ),
    },
    {
      key: 'source', header: t.hotelDirectory.source, defaultHidden: true,
      cell: (row) =>
        row.sourceSystem ? (
          <Badge variant="outline">{row.sourceSystem}</Badge>
        ) : (
          <span className="text-muted-foreground">{t.hotelDirectory.localOnly}</span>
        ),
    },
    {
      key: 'syncStatus', header: t.hotelDirectory.syncStatus,
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          <Badge variant={SYNC_VARIANT[row.syncStatus] ?? 'default'}>
            {t.syncStatus[row.syncStatus as keyof typeof t.syncStatus] ?? row.syncStatus}
          </Badge>
          {row.syncStatus === 'NEEDS_MATCH' ? (
            <HelpTip helpKey="field.syncStatus" label={t.hotelDirectory.syncStatus} />
          ) : null}
        </span>
      ),
    },
    {
      key: 'lastSync', header: t.hotelDirectory.lastSync, defaultHidden: true,
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">
          {row.lastSyncedAt ? formatDateTime(row.lastSyncedAt, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'status', header: t.common.status, mobile: 'hidden',
      cell: (row) => (
        <Badge variant={row.isActive ? 'success' : 'default'}>
          {row.isActive ? t.users.active : t.users.inactive}
        </Badge>
      ),
    },
  ];

  const last = status.data?.lastRun;
  const syncBlockedReason = !canSync
    ? t.errors.FORBIDDEN
    : !status.data?.configured
      ? t.hotelDirectory.notConfigured
      : status.data?.running
        ? t.errors.SYNC_IN_PROGRESS
        : null;

  return (
    <>
      <PageHeader
        guideKey="page.hotels"
        title={t.nav.hotels}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(syncBlockedReason)}
              loading={sync.isPending || status.data?.running}
              onClick={() => sync.mutate(false)}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.hotelDirectory.syncHotels}</span>
            </Button>
            <DisabledReason reason={syncBlockedReason} />
          </span>
        }
      />

      {/* The integration boundary, stated where people look at hotels. */}
      <HelpNotice noticeKey="notice.hotelDirectorySource" />

      <Card className="mb-4">
        <CardContent className="pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {t.hotelDirectory.source}: {status.data?.source ?? 'ELBAKRI Rate Hub'}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {last
                  ? `${t.hotelDirectory.lastSync}: ${formatDateTime(last.finishedAt, locale)}`
                  : t.hotelDirectory.neverSynced}
              </p>
            </div>

            {last ? (
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
                <Stat label={t.hotelDirectory.received} value={last.received} />
                <Stat label={t.hotelDirectory.created} value={last.created} />
                <Stat label={t.hotelDirectory.updated} value={last.updated} />
                <Stat label={t.hotelDirectory.matched} value={last.matched} />
                <Stat
                  label={t.hotelDirectory.needsReview}
                  value={last.needsReview}
                  tone={last.needsReview > 0 ? 'warning' : undefined}
                />
                <Stat
                  label={t.imports.errors}
                  value={last.errors.length}
                  tone={last.errors.length > 0 ? 'danger' : undefined}
                />
              </dl>
            ) : null}
          </div>

          {/* A failed sync is not a broken hotel list — it just was not refreshed. */}
          {last && last.status === 'FAILED' ? (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-2xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {t.hotelDirectory.syncFailed}
                {last.errors[0] ? ` — ${last.errors[0]}` : ''}
              </span>
            </p>
          ) : null}

          {last && last.needsReview > 0 ? (
            <Link
              href="/matching?entityType=HOTEL"
              className="mt-3 flex items-center justify-between gap-2 rounded-md bg-warning-subtle px-3 py-2 text-2xs text-warning transition-colors hover:brightness-95"
            >
              <span className="flex items-center gap-2">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                {t.hotelDirectory.needsReviewHint}
              </span>
              <Badge variant="warning">{last.needsReview}</Badge>
            </Link>
          ) : last && last.status === 'SUCCESS' ? (
            <p className="mt-3 flex items-center gap-2 text-2xs text-success">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
              {t.hotelDirectory.allSynchronized}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/master-data/hotels/${row.id}`)}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSortChange={(sortBy, sortDir) => update({ sortBy, sortDir })}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRefresh={() => query.refetch()}
        mobileBadge={(row) => (
          <Badge variant={SYNC_VARIANT[row.syncStatus] ?? 'default'}>
            {t.syncStatus[row.syncStatus as keyof typeof t.syncStatus] ?? row.syncStatus}
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

            <Input
              placeholder={t.hotelDirectory.region}
              value={state.filters.region ?? ''}
              onChange={(e) => update({ region: e.target.value || undefined })}
              className="h-8 w-32 text-xs"
              aria-label={t.hotelDirectory.region}
            />

            <select
              value={state.filters.syncStatus ?? ''}
              onChange={(e) => update({ syncStatus: e.target.value || undefined })}
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
              aria-label={t.hotelDirectory.syncStatus}
            >
              <option value="">{t.hotelDirectory.syncStatus}: {t.common.all}</option>
              <option value="LINKED">{t.syncStatus.LINKED}</option>
              <option value="NEEDS_MATCH">{t.syncStatus.NEEDS_MATCH}</option>
              <option value="LOCAL_ONLY">{t.syncStatus.LOCAL_ONLY}</option>
            </select>

            <select
              value={state.filters.starRating ?? ''}
              onChange={(e) => update({ starRating: e.target.value || undefined })}
              className="hidden h-8 rounded-md border border-input bg-surface px-2 text-xs lg:block"
              aria-label={t.hotelDirectory.stars}
            >
              <option value="">{t.hotelDirectory.stars}: {t.common.all}</option>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={s}>{s}★</option>
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
    </>
  );
}

function Stat({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone?: 'warning' | 'danger';
}) {
  return (
    <div className="whitespace-nowrap">
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd
        className={`inline font-medium tabular-nums ${
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function HotelsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <HotelsContent />
    </Suspense>
  );
}
