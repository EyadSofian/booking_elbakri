'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Info, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { ExcursionStatus, PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Item {
  id: string;
  status: string;
  serviceDate: string | null;
  serviceDateRaw: string | null;
  activityRaw: string | null;
  transferRequired: boolean;
  catalogItem: { id: string; name: string; nameAr: string | null } | null;
}

interface OrderRow {
  id: string;
  reference: string;
  status: string;
  paxCount: number | null;
  childCount: number | null;
  legacyRestRaw: string | null;
  hotelRaw: string | null;
  hotel: { id: string; name: string } | null;
  notes: string | null;
  tripFile: { id: string; reference: string } | null;
  partner: { id: string; name: string } | null;
  leadTraveler: {
    id: string; fullName: string; phoneRaw: string | null; phoneNormalized: string | null;
    nationalityRaw: string | null; nationality: { name: string; nameAr: string | null } | null;
  } | null;
  items: Item[];
}

export default function ExcursionsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'createdAt', sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useQuery({
    queryKey: ['excursion-bookings', state],
    queryFn: () =>
      api.get<PaginatedResponse<OrderRow>>('/excursion-bookings', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<OrderRow>[] = [
    {
      key: 'traveler', header: t.trips.leadTraveler, alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="block max-w-52 truncate font-medium">
          {row.leadTraveler?.fullName ?? '—'}
        </span>
      ),
    },
    {
      key: 'activities', header: t.excursions.activities, mobile: 'subtitle',
      cell: (row) => (
        // An order is one customer with several activities — the whole point of
        // the continuation-row grouping — so the list shows them together.
        <span className="block max-w-72 truncate">
          {row.items.length === 0
            ? '—'
            : row.items
                .map((i) => (locale === 'ar' ? i.catalogItem?.nameAr : i.catalogItem?.name) ?? i.activityRaw ?? '?')
                .join(' · ')}
        </span>
      ),
    },
    {
      key: 'itemCount', header: '#',
      cell: (row) => <span className="tabular-nums">{row.items.length}</span>,
    },
    {
      key: 'firstDate', header: t.common.date, sortKey: 'firstServiceDate',
      cell: (row) => {
        const dated = row.items.filter((i) => i.serviceDate);
        if (!dated.length) return <span className="text-muted-foreground">—</span>;
        const first = dated[0].serviceDate!;
        const last = dated[dated.length - 1].serviceDate!;
        return (
          <span className="tabular-nums">
            {formatDate(first, locale)}
            {last !== first ? ` – ${formatDate(last, locale)}` : ''}
          </span>
        );
      },
    },
    {
      key: 'pax', header: t.trips.pax,
      cell: (row) => (
        <span className="tabular-nums">
          {row.paxCount ?? '—'}
          {row.childCount ? ` +${row.childCount}` : ''}
        </span>
      ),
    },
    {
      key: 'hotel', header: t.hotels.hotel,
      cell: (row) => (
        <span className="block max-w-48 truncate">{row.hotel?.name ?? row.hotelRaw ?? '—'}</span>
      ),
    },
    {
      key: 'phone', header: t.common.phone, defaultHidden: true,
      cell: (row) => (
        <span dir="ltr" className="tabular-nums">
          {row.leadTraveler?.phoneNormalized ?? row.leadTraveler?.phoneRaw ?? '—'}
        </span>
      ),
    },
    {
      key: 'nationality', header: t.common.nationality, defaultHidden: true,
      cell: (row) =>
        (locale === 'ar' ? row.leadTraveler?.nationality?.nameAr : row.leadTraveler?.nationality?.name) ??
        row.leadTraveler?.nationalityRaw ?? '—',
    },
    {
      key: 'legacyRest', header: t.excursions.legacyRest, defaultHidden: true,
      cell: (row) =>
        row.legacyRestRaw ? (
          // Shown verbatim: the column's business meaning was never defined, so
          // no interpretation is applied to it.
          <span className="font-mono text-2xs" title={t.excursions.legacyRestHint}>
            {row.legacyRestRaw}
          </span>
        ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'partner', header: t.trips.agency,
      cell: (row) => row.partner?.name ?? '—',
    },
    {
      key: 'status', header: t.common.status, sortKey: 'status', mobile: 'hidden',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          {row.items.some((i) => i.transferRequired) ? (
            <Badge variant="info" title={t.excursions.transferRequired}>T</Badge>
          ) : null}
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
          </Badge>
        </span>
      ),
    },
  ];

  const download = (legacy = false) =>
    api
      .download('/reports/excursions.xlsx', { ...state.filters, q: state.q || undefined, legacyLayout: legacy || undefined })
      .catch(() => toast.error(t.common.error));

  return (
    <>
      <PageHeader
        title={t.excursions.title}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          can(PERMISSIONS.REPORTS_EXPORT) ? (
            <>
              <Button variant="outline" size="sm" onClick={() => download(false)}>
                <Download className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.exportExcel}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => download(true)} title={t.reports.legacyLayoutHint}>
                <span className="hidden sm:inline">{t.reports.legacyLayout}</span>
                <Download className="size-3.5 sm:hidden" aria-hidden />
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-3 flex items-start gap-2 rounded-md border bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{t.excursions.legacyRestHint}</span>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        onRowClick={(row) => row.tripFile && router.push(`/trips/${row.tripFile.id}`)}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSortChange={(sortBy, sortDir) => update({ sortBy, sortDir })}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRefresh={() => query.refetch()}
        mobileBadge={(row) => (
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
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
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.common.filters}</span>
              {activeFilterCount > 0 ? <Badge variant="brand">{activeFilterCount}</Badge> : null}
            </Button>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                <X className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.clearFilters}</span>
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.common.filters}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dateFrom">{t.common.from}</Label>
                <Input id="dateFrom" type="date" value={state.filters.dateFrom ?? ''}
                  onChange={(e) => update({ dateFrom: e.target.value || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dateTo">{t.common.to}</Label>
                <Input id="dateTo" type="date" value={state.filters.dateTo ?? ''}
                  onChange={(e) => update({ dateTo: e.target.value || undefined })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">{t.common.status}</Label>
              <select id="status" value={state.filters.status ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                <option value="">{t.common.all}</option>
                {Object.values(ExcursionStatus).map((s) => (
                  <option key={s} value={s}>{t.status[s as keyof typeof t.status] ?? s}</option>
                ))}
              </select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>{t.common.clearFilters}</Button>
            <Button onClick={() => setFiltersOpen(false)}>{t.common.apply}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
