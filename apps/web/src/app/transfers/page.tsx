'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LayoutList, Search, SlidersHorizontal, Table2, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERMISSIONS, TransferDirection, TransferStatus, type PaginatedResponse,
} from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { cn, formatDate, formatMinutes } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface LegRow {
  id: string;
  direction: string;
  status: string;
  serviceDate: string | null;
  pickupTimeMinutes: number | null;
  pickupTimeRaw: string | null;
  flightNumber: string | null;
  paxCount: number | null;
  securityApprovalRequired: boolean;
  flowerBouquet: boolean;
  notes: string | null;
  fromRaw: string | null;
  toRaw: string | null;
  fromLocation: { id: string; name: string; nameAr: string | null } | null;
  toLocation: { id: string; name: string; nameAr: string | null } | null;
  driver: { id: string; fullName: string; phone: string | null } | null;
  vehicle: { id: string; plateNumber: string; model: string | null } | null;
  transferBooking: {
    id: string; reference: string; paxCount: number | null; notes: string | null;
    tripFile: { id: string; reference: string } | null;
    partner: { id: string; name: string; nameAr: string | null } | null;
    leadTraveler: { id: string; fullName: string; phoneRaw: string | null; phoneNormalized: string | null } | null;
  };
}

interface Driver { id: string; fullName: string }
interface Vehicle { id: string; plateNumber: string }

export default function TransfersPage() {
  const { t, locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({ sortBy: 'serviceDate', sortDir: 'asc' });
  const [searchInput, setSearchInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assigning, setAssigning] = useState<LegRow | null>(null);

  const query = useQuery({
    queryKey: ['transfer-legs', state],
    queryFn: () =>
      api.get<PaginatedResponse<LegRow>>('/transfers/legs', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const drivers = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get<Driver[]>('/drivers'),
    enabled: can(PERMISSIONS.TRANSFERS_ASSIGN),
  });
  const vehicles = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Vehicle[]>('/vehicles'),
    enabled: can(PERMISSIONS.TRANSFERS_ASSIGN),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['transfer-legs'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const assign = useMutation({
    mutationFn: (input: { legId: string; driverId?: string; vehicleId?: string }) =>
      api.post(`/transfers/legs/${input.legId}/assign`, {
        driverId: input.driverId || undefined,
        vehicleId: input.vehicleId || undefined,
      }),
    onSuccess: () => { toast.success(t.transfers.assign); setAssigning(null); invalidate(); },
    onError: (err: { code?: string }) =>
      toast.error((err.code && (t.errors as Record<string, string>)[err.code]) || t.errors.INTERNAL_ERROR),
  });

  const changeStatus = useMutation({
    mutationFn: (input: { legId: string; status: string }) =>
      api.post(`/transfers/legs/${input.legId}/status`, { status: input.status }),
    onSuccess: () => { toast.success(t.common.save); invalidate(); },
    onError: (err: { code?: string }) =>
      toast.error((err.code && (t.errors as Record<string, string>)[err.code]) || t.errors.INTERNAL_ERROR),
  });

  const columns: Column<LegRow>[] = [
    {
      key: 'time', header: t.common.time, sortKey: 'pickupTimeMinutes', alwaysVisible: true, mobile: 'title',
      cell: (row) => {
        const time = formatMinutes(row.pickupTimeMinutes);
        return time ? (
          <span className="font-medium tabular-nums">{time}</span>
        ) : (
          <span className="flex items-center gap-1 text-warning" title={row.pickupTimeRaw ?? undefined}>
            <TriangleAlert className="size-3" aria-hidden />
            <span className="tabular-nums">{row.pickupTimeRaw ?? '—'}</span>
          </span>
        );
      },
    },
    {
      key: 'date', header: t.common.date, sortKey: 'serviceDate',
      cell: (row) => <span className="tabular-nums">{formatDate(row.serviceDate, locale)}</span>,
    },
    {
      key: 'traveler', header: t.trips.leadTraveler, mobile: 'subtitle',
      cell: (row) => (
        <span className="block max-w-48 truncate">
          {row.transferBooking.leadTraveler?.fullName ?? '—'}
        </span>
      ),
    },
    {
      key: 'pax', header: t.trips.pax,
      cell: (row) => <span className="tabular-nums">{row.paxCount ?? row.transferBooking.paxCount ?? '—'}</span>,
    },
    {
      key: 'route', header: `${t.common.from} → ${t.common.to}`,
      cell: (row) => (
        <span className="block max-w-64 truncate">
          {(row.fromLocation?.name ?? row.fromRaw ?? '?')} → {(row.toLocation?.name ?? row.toRaw ?? '?')}
        </span>
      ),
    },
    {
      key: 'flight', header: t.transfers.flightNumber,
      cell: (row) => <span className="tabular-nums">{row.flightNumber ?? '—'}</span>,
    },
    {
      key: 'driver', header: t.transfers.driver,
      cell: (row) =>
        row.driver ? (
          row.driver.fullName
        ) : (
          <span className="text-muted-foreground">{t.common.notSet}</span>
        ),
    },
    {
      key: 'vehicle', header: t.transfers.vehicle, defaultHidden: true,
      cell: (row) => row.vehicle?.plateNumber ?? '—',
    },
    {
      key: 'partner', header: t.trips.agency,
      cell: (row) => row.transferBooking.partner?.name ?? '—',
    },
    {
      key: 'status', header: t.common.status, sortKey: 'status', mobile: 'hidden',
      cell: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {t.status[row.status as keyof typeof t.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'actions', header: t.common.actions, mobile: 'hidden',
      cell: (row) => (
        <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {can(PERMISSIONS.TRANSFERS_ASSIGN) ? (
            <Button variant="ghost" size="sm" onClick={() => setAssigning(row)}>
              {t.transfers.assign}
            </Button>
          ) : null}
          {can(PERMISSIONS.TRANSFERS_STATUS_UPDATE) ? (
            <select
              value=""
              onChange={(e) => e.target.value && changeStatus.mutate({ legId: row.id, status: e.target.value })}
              className="h-7 rounded border border-input bg-surface px-1.5 text-2xs"
              aria-label={t.common.status}
            >
              <option value="">…</option>
              {Object.values(TransferStatus)
                .filter((s) => s !== row.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {t.status[s as keyof typeof t.status] ?? s}
                  </option>
                ))}
            </select>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        guideKey="page.transfers"
        title={t.transfers.title}
        description={query.data ? `${query.data.meta.total} ${t.transfers.legs.toLowerCase()}` : undefined}
        actions={
          can(PERMISSIONS.REPORTS_EXPORT) ? (
            <>
              <Button
                variant="outline" size="sm"
                onClick={() => api.download('/reports/transfers.xlsx', { ...state.filters }).catch(() => toast.error(t.common.error))}
              >
                <Download className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.export}</span>
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => api.download('/reports/transfers.xlsx', { ...state.filters, legacyLayout: 'true' }).catch(() => toast.error(t.common.error))}
                title={t.reports.legacyLayoutHint}
              >
                <span className="hidden sm:inline">{t.reports.legacyLayout}</span>
                <span className="sm:hidden">{t.common.export}</span>
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
              <Label htmlFor="direction">{t.transfers.direction}</Label>
              <select id="direction" value={state.filters.direction ?? ''}
                onChange={(e) => update({ direction: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                <option value="">{t.common.all}</option>
                {Object.values(TransferDirection).map((d) => (
                  <option key={d} value={d}>{t.direction[d as keyof typeof t.direction] ?? d}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">{t.common.status}</Label>
              <select id="status" value={state.filters.status ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                <option value="">{t.common.all}</option>
                {Object.values(TransferStatus).map((s) => (
                  <option key={s} value={s}>{t.status[s as keyof typeof t.status] ?? s}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-3.5 accent-brand-700"
                checked={state.filters.unassignedOnly === 'true'}
                onChange={(e) => update({ unassignedOnly: e.target.checked ? 'true' : undefined })} />
              {t.transfers.unassignedOnly}
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-3.5 accent-brand-700"
                checked={state.filters.missingPickupOnly === 'true'}
                onChange={(e) => update({ missingPickupOnly: e.target.checked ? 'true' : undefined })} />
              {t.transfers.missingPickupOnly}
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>{t.common.clearFilters}</Button>
            <Button onClick={() => setFiltersOpen(false)}>{t.common.apply}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assigning)} onOpenChange={(open) => !open && setAssigning(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.transfers.assignDriver}</DialogTitle>
          </DialogHeader>
          {assigning ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                assign.mutate({
                  legId: assigning.id,
                  driverId: String(form.get('driverId') ?? ''),
                  vehicleId: String(form.get('vehicleId') ?? ''),
                });
              }}
            >
              <DialogBody className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {formatDate(assigning.serviceDate, locale)} ·{' '}
                  {formatMinutes(assigning.pickupTimeMinutes) ?? assigning.pickupTimeRaw ?? '—'} ·{' '}
                  {(assigning.fromLocation?.name ?? assigning.fromRaw ?? '?')} → {(assigning.toLocation?.name ?? assigning.toRaw ?? '?')}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="driverId">{t.transfers.driver}</Label>
                  <select id="driverId" name="driverId" defaultValue={assigning.driver?.id ?? ''}
                    className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                    <option value="">{t.common.none}</option>
                    {(drivers.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>{d.fullName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicleId">{t.transfers.vehicle}</Label>
                  <select id="vehicleId" name="vehicleId" defaultValue={assigning.vehicle?.id ?? ''}
                    className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                    <option value="">{t.common.none}</option>
                    {(vehicles.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>{v.plateNumber}</option>
                    ))}
                  </select>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAssigning(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={assign.isPending}>{t.common.save}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
