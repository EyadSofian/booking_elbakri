'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Lock, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, VisaStatus, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDate, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface VisaRow {
  id: string;
  reference: string;
  status: string;
  originRaw: string | null;
  destinationRaw: string | null;
  paxCount: number | null;
  serviceDate: string | null;
  serviceDateRaw: string | null;
  currency: string;
  /** Omitted by the API entirely without visas.finance.read. */
  netAmount?: number | string | null;
  sellAmount?: number | string | null;
  margin?: number | string | null;
  tripFile: { id: string; reference: string } | null;
  partner: { id: string; name: string } | null;
  leadTraveler: {
    id: string; fullName: string; phoneRaw: string | null; phoneNormalized: string | null;
    nationalityRaw: string | null; nationality: { name: string; nameAr: string | null } | null;
  } | null;
  _count?: { applicants: number };
}

export default function VisasPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'serviceDate', sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The API omits the amounts entirely without this permission — the check here
  // only decides whether to render the columns at all.
  const canSeeAmounts = can(PERMISSIONS.VISAS_FINANCE_READ);

  const query = useQuery({
    queryKey: ['visa-orders', state],
    queryFn: () =>
      api.get<PaginatedResponse<VisaRow>>('/visa-orders', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<VisaRow>[] = [
    {
      key: 'traveler', header: t.trips.leadTraveler, alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="block max-w-52 truncate font-medium">
          {row.leadTraveler?.fullName ?? '—'}
        </span>
      ),
    },
    {
      key: 'route', header: `${t.visas.origin} → ${t.visas.destination}`, mobile: 'subtitle',
      cell: (row) => (
        <span className="block max-w-48 truncate">
          {row.originRaw ?? '?'} → {row.destinationRaw ?? '?'}
        </span>
      ),
    },
    {
      key: 'nationality', header: t.common.nationality,
      cell: (row) =>
        (locale === 'ar' ? row.leadTraveler?.nationality?.nameAr : row.leadTraveler?.nationality?.name) ??
        row.leadTraveler?.nationalityRaw ?? '—',
    },
    {
      key: 'serviceDate', header: t.common.date, sortKey: 'serviceDate',
      cell: (row) =>
        row.serviceDate ? (
          <span className="tabular-nums">{formatDate(row.serviceDate, locale)}</span>
        ) : row.serviceDateRaw ? (
          <span className="text-warning">{row.serviceDateRaw}</span>
        ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'pax', header: t.trips.pax,
      cell: (row) => <span className="tabular-nums">{row.paxCount ?? '—'}</span>,
    },
    {
      key: 'partner', header: t.trips.agency,
      cell: (row) => row.partner?.name ?? '—',
    },
    ...(canSeeAmounts
      ? ([
          {
            key: 'net', header: t.visas.net, sortKey: 'netAmount',
            cell: (row: VisaRow) => (
              <span className="tabular-nums">{formatMoney(row.netAmount as number, row.currency, locale)}</span>
            ),
          },
          {
            key: 'sell', header: t.visas.sell, sortKey: 'sellAmount',
            cell: (row: VisaRow) => (
              <span className="tabular-nums">{formatMoney(row.sellAmount as number, row.currency, locale)}</span>
            ),
          },
          {
            key: 'margin', header: t.visas.margin,
            cell: (row: VisaRow) => {
              // Always the server's derived value; never recomputed here and
              // never editable, so it cannot drift from net and sell.
              const margin = row.margin;
              if (margin === null || margin === undefined) {
                return <span className="text-muted-foreground">—</span>;
              }
              const value = Number(margin);
              return (
                <span className={`tabular-nums font-medium ${value < 0 ? 'text-danger' : value > 0 ? 'text-success' : ''}`}>
                  {formatMoney(value, row.currency, locale)}
                </span>
              );
            },
          },
        ] as Column<VisaRow>[])
      : []),
    {
      key: 'status', header: t.common.status, sortKey: 'status', mobile: 'hidden',
      cell: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {t.status[row.status as keyof typeof t.status] ?? row.status}
        </Badge>
      ),
    },
  ];

  const download = (legacy = false) =>
    api
      .download('/reports/visas.xlsx', { ...state.filters, q: state.q || undefined, legacyLayout: legacy || undefined })
      .catch(() => toast.error(t.common.error));

  return (
    <>
      <PageHeader
        title={t.visas.title}
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

      {!canSeeAmounts ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          <span>{t.visas.financeHidden}</span>
        </div>
      ) : (
        <div className="mb-3 text-2xs text-muted-foreground">{t.visas.marginDerived}</div>
      )}

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
            <div className="space-y-1.5">
              <Label htmlFor="status">{t.common.status}</Label>
              <select id="status" value={state.filters.status ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                <option value="">{t.common.all}</option>
                {Object.values(VisaStatus).map((s) => (
                  <option key={s} value={s}>{t.status[s as keyof typeof t.status] ?? s}</option>
                ))}
              </select>
            </div>
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
