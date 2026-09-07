'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { HotelBookingStatus, PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
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
import { HotelPicker } from '@/components/data/hotel-picker';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Segment {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  checkInRaw: string | null;
  checkOutRaw: string | null;
  nights: number | null;
  hotel: { id: string; name: string } | null;
  hotelRaw: string | null;
  mealPlan: { name: string; nameAr: string | null } | null;
  mealPlanRaw: string | null;
  roomAllocations: Array<{
    id: string; quantity: number;
    roomType: { name: string; nameAr: string | null } | null;
    roomTypeRaw: string | null;
  }>;
}

interface BookingRow {
  id: string;
  reference: string;
  status: string;
  bookingDate: string | null;
  securityApprovalRequired: boolean;
  hotel: { id: string; name: string } | null;
  hotelRaw: string | null;
  tripFile: { id: string; reference: string } | null;
  partner: { id: string; name: string; nameAr: string | null } | null;
  leadTraveler: {
    id: string; fullName: string; phoneRaw: string | null; phoneNormalized: string | null;
    nationalityRaw: string | null; nationality: { name: string; nameAr: string | null } | null;
  } | null;
  staySegments: Segment[];
}

/** The first segment carries the dates people scan the list by. */
function firstSegment(row: BookingRow): Segment | undefined {
  return row.staySegments[0];
}

export default function HotelBookingsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'checkIn', sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useQuery({
    queryKey: ['hotel-bookings', state],
    queryFn: () =>
      api.get<PaginatedResponse<BookingRow>>('/hotel-bookings', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });


  const columns: Column<BookingRow>[] = [
    {
      key: 'traveler', header: t.trips.leadTraveler, alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="block max-w-56 truncate font-medium">
          {row.leadTraveler?.fullName ?? '—'}
        </span>
      ),
    },
    {
      key: 'hotel', header: t.hotels.hotel, mobile: 'subtitle',
      cell: (row) => {
        const segment = firstSegment(row);
        return (
          <span className="block max-w-56 truncate">
            {segment?.hotel?.name ?? segment?.hotelRaw ?? row.hotel?.name ?? row.hotelRaw ?? '—'}
            {row.staySegments.length > 1 ? (
              <Badge variant="outline" className="ms-1.5">
                +{row.staySegments.length - 1}
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'nationality', header: t.common.nationality, defaultHidden: true,
      cell: (row) =>
        (locale === 'ar' ? row.leadTraveler?.nationality?.nameAr : row.leadTraveler?.nationality?.name) ??
        row.leadTraveler?.nationalityRaw ?? '—',
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
      key: 'checkIn', header: t.hotels.checkIn, sortKey: 'checkIn',
      cell: (row) => {
        const segment = firstSegment(row);
        if (segment?.checkIn) {
          return <span className="tabular-nums">{formatDate(segment.checkIn, locale)}</span>;
        }
        // An unreadable legacy date shows what the workbook actually said,
        // rather than a blank that hides the problem.
        return segment?.checkInRaw ? (
          <span className="flex items-center gap-1 text-warning" title={t.dataQuality.rawValue}>
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {segment.checkInRaw}
          </span>
        ) : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: 'checkOut', header: t.hotels.checkOut, sortKey: 'checkOut',
      cell: (row) => {
        const segment = firstSegment(row);
        if (segment?.checkOut) {
          return <span className="tabular-nums">{formatDate(segment.checkOut, locale)}</span>;
        }
        return segment?.checkOutRaw ? (
          <span className="flex items-center gap-1 text-warning">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {segment.checkOutRaw}
          </span>
        ) : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: 'nights', header: t.hotels.nights,
      cell: (row) => {
        const nights = firstSegment(row)?.nights;
        return <span className="tabular-nums">{nights ?? '—'}</span>;
      },
    },
    {
      key: 'roomType', header: t.hotels.roomType,
      cell: (row) => {
        const rooms = firstSegment(row)?.roomAllocations ?? [];
        const label = rooms
          .map((r) => `${r.quantity > 1 ? `${r.quantity} ` : ''}${r.roomType?.name ?? r.roomTypeRaw ?? ''}`.trim())
          .filter(Boolean)
          .join(', ');
        return <span className="block max-w-40 truncate">{label || '—'}</span>;
      },
    },
    {
      key: 'mealPlan', header: t.hotels.mealPlan,
      cell: (row) => {
        const segment = firstSegment(row);
        return (
          (locale === 'ar' ? segment?.mealPlan?.nameAr : segment?.mealPlan?.name) ??
          segment?.mealPlanRaw ?? '—'
        );
      },
    },
    {
      key: 'bookingDate', header: t.hotels.bookingDate, sortKey: 'bookingDate', defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.bookingDate, locale)}</span>,
    },
    {
      key: 'partner', header: t.trips.agency,
      cell: (row) => row.partner?.name ?? '—',
    },
    {
      key: 'status', header: t.common.status, sortKey: 'status', mobile: 'hidden',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          {row.securityApprovalRequired ? (
            <Badge variant="info" title={t.hotels.securityApproval}>!</Badge>
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
      .download('/reports/hotel-bookings.xlsx', { ...state.filters, q: state.q || undefined, legacyLayout: legacy || undefined })
      .catch(() => toast.error(t.common.error));

  return (
    <>
      <PageHeader
        guideKey="page.hotelBookings"
        title={t.hotels.title}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          can(PERMISSIONS.REPORTS_EXPORT) ? (
            <>
              <Button variant="outline" size="sm" onClick={() => download(false)}>
                <Download className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.exportExcel}</span>
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => download(true)}
                title={t.reports.legacyLayoutHint}
              >
                <span className="hidden sm:inline">{t.reports.legacyLayout}</span>
                <Download className="size-3.5 sm:hidden" aria-hidden />
              </Button>
            </>
          ) : null
        }
      />

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
                <Label htmlFor="checkInFrom">{t.hotels.checkIn} — {t.common.from}</Label>
                <Input id="checkInFrom" type="date" value={state.filters.checkInFrom ?? ''}
                  onChange={(e) => update({ checkInFrom: e.target.value || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkInTo">{t.hotels.checkIn} — {t.common.to}</Label>
                <Input id="checkInTo" type="date" value={state.filters.checkInTo ?? ''}
                  onChange={(e) => update({ checkInTo: e.target.value || undefined })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hotelId">{t.hotels.hotel}</Label>
              {/*
                A searchable picker rather than a native select: the catalogue
                runs to hundreds of hotels, and people search by the spelling
                they remember, which is often an alias.
              */}
              <HotelPicker
                id="hotelId"
                value={state.filters.hotelId ?? null}
                onChange={(hotelId) => update({ hotelId: hotelId ?? undefined })}
                placeholder={t.common.all}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">{t.common.status}</Label>
              <select id="status" value={state.filters.status ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                <option value="">{t.common.all}</option>
                {Object.values(HotelBookingStatus).map((s) => (
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
