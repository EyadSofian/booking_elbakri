'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, TripFileStatus, type PaginatedResponse } from '@elbakri/shared';
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

interface TripRow {
  id: string;
  reference: string;
  status: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  leadTraveler: {
    id: string; fullName: string; phoneRaw: string | null; phoneNormalized: string | null;
    nationalityRaw: string | null; nationality: { code: string; name: string; nameAr: string | null } | null;
  } | null;
  partner: { id: string; name: string; nameAr: string | null } | null;
  hotelBookings: Array<{ hotel: { id: string; name: string } | null; hotelRaw: string | null }>;
  _count: {
    hotelBookings: number; transferBookings: number;
    excursionBookings: number; visaOrders: number; financialDocuments: number;
  };
}

export default function TripsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({ sortBy: 'createdAt' });
  const [searchInput, setSearchInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useQuery({
    queryKey: ['trips', state],
    queryFn: () =>
      api.get<PaginatedResponse<TripRow>>('/trips', {
        page: state.page,
        pageSize: state.pageSize,
        q: state.q || undefined,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<TripRow>[] = [
    {
      key: 'reference',
      header: t.common.reference,
      sortKey: 'reference',
      alwaysVisible: true,
      mobile: 'title',
      cell: (row) => <span className="font-medium tabular-nums">{row.reference}</span>,
    },
    {
      key: 'traveler',
      header: t.trips.leadTraveler,
      mobile: 'subtitle',
      cell: (row) => (
        <span className="block max-w-56 truncate">{row.leadTraveler?.fullName ?? '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: t.common.phone,
      cell: (row) => (
        <span className="tabular-nums" dir="ltr">
          {row.leadTraveler?.phoneNormalized ?? row.leadTraveler?.phoneRaw ?? '—'}
        </span>
      ),
    },
    {
      key: 'nationality',
      header: t.common.nationality,
      defaultHidden: true,
      cell: (row) =>
        (locale === 'ar' ? row.leadTraveler?.nationality?.nameAr : row.leadTraveler?.nationality?.name) ??
        row.leadTraveler?.nationalityRaw ??
        '—',
    },
    {
      key: 'partner',
      header: t.trips.agency,
      cell: (row) => (locale === 'ar' ? row.partner?.nameAr : row.partner?.name) ?? row.partner?.name ?? '—',
    },
    {
      key: 'travelStart',
      header: t.trips.travelStart,
      sortKey: 'travelStartDate',
      cell: (row) => <span className="tabular-nums">{formatDate(row.travelStartDate, locale)}</span>,
    },
    {
      key: 'travelEnd',
      header: t.trips.travelEnd,
      sortKey: 'travelEndDate',
      cell: (row) => <span className="tabular-nums">{formatDate(row.travelEndDate, locale)}</span>,
    },
    {
      key: 'hotel',
      header: t.hotels.hotel,
      cell: (row) => {
        const booking = row.hotelBookings[0];
        return (
          <span className="block max-w-48 truncate">
            {booking?.hotel?.name ?? booking?.hotelRaw ?? '—'}
          </span>
        );
      },
    },
    {
      key: 'services',
      header: t.trips.services,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          {row._count.hotelBookings > 0 ? (
            <Badge variant="outline" title={t.nav.hotelBookings}>
              H {row._count.hotelBookings}
            </Badge>
          ) : null}
          {row._count.transferBookings > 0 ? (
            <Badge variant="outline" title={t.nav.transfers}>
              T {row._count.transferBookings}
            </Badge>
          ) : null}
          {row._count.excursionBookings > 0 ? (
            <Badge variant="outline" title={t.nav.excursions}>
              E {row._count.excursionBookings}
            </Badge>
          ) : null}
          {row._count.visaOrders > 0 ? (
            <Badge variant="outline" title={t.nav.visas}>
              V {row._count.visaOrders}
            </Badge>
          ) : null}
          {row._count.hotelBookings + row._count.transferBookings + row._count.excursionBookings + row._count.visaOrders === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      sortKey: 'status',
      mobile: 'hidden',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{t.status[row.status as keyof typeof t.status] ?? row.status}</Badge>,
    },
  ];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    update({ q: searchInput });
  };

  const exportTrips = async () => {
    try {
      await api.download('/reports/hotel-bookings.xlsx', {
        partnerId: state.filters.partnerId,
        status: state.filters.status,
      });
    } catch {
      toast.error(t.common.error);
    }
  };

  return (
    <>
      <PageHeader
        title={t.trips.title}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          <>
            {can(PERMISSIONS.REPORTS_EXPORT) ? (
              <Button variant="outline" size="sm" onClick={exportTrips}>
                <Download className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.export}</span>
              </Button>
            ) : null}
            {can(PERMISSIONS.TRIPS_CREATE) ? (
              <Button size="sm" asChild>
                <Link href="/trips/new">
                  <Plus className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">{t.trips.newTripFile}</span>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/trips/${row.id}`)}
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
            <form onSubmit={submitSearch} className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.common.search}
                className="h-8 ps-8 text-xs"
              />
            </form>

            {/* Filters live in a sheet on mobile so they never crowd the list. */}
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.common.filters}</span>
              {activeFilterCount > 0 ? <Badge variant="brand">{activeFilterCount}</Badge> : null}
            </Button>

            {activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  clearFilters();
                }}
              >
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
              <select
                id="status"
                value={state.filters.status ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              >
                <option value="">{t.common.all}</option>
                {Object.values(TripFileStatus).map((value) => (
                  <option key={value} value={value}>
                    {t.status[value as keyof typeof t.status] ?? value}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="travelFrom">{t.common.from}</Label>
                <Input
                  id="travelFrom"
                  type="date"
                  value={state.filters.travelFrom ?? ''}
                  onChange={(e) => update({ travelFrom: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travelTo">{t.common.to}</Label>
                <Input
                  id="travelTo"
                  type="date"
                  value={state.filters.travelTo ?? ''}
                  onChange={(e) => update({ travelTo: e.target.value || undefined })}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>
              {t.common.clearFilters}
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>{t.common.apply}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
