'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowUpRight, CalendarCheck, CalendarX, CarFront, Clock,
  FileText, Globe2, Hotel, Info, Paperclip, Receipt, Ship, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, TripFileStatus } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDate, formatDateTime, formatMinutes, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  date: string | null;
  time: string | null;
  type: string;
  title: string;
  detail: string | null;
  entityType: string;
  entityId: string;
  status?: string;
}

interface TripDetail {
  id: string;
  reference: string;
  status: string;
  version: number;
  travelStartDate: string | null;
  travelEndDate: string | null;
  travelDatesOverridden: boolean;
  paxCount: number | null;
  childCount: number | null;
  notes: string | null;
  legacySource: { workbook?: string; sheet?: string; row?: number } | null;
  leadTraveler: {
    id: string; fullName: string; phoneRaw: string | null; phoneNormalized: string | null;
    nationalityRaw: string | null; nationality: { name: string; nameAr: string | null } | null;
  } | null;
  partner: { id: string; name: string; nameAr: string | null } | null;
  travelers: Array<{ id: string; role: string; traveler: { id: string; fullName: string } }>;
  hotelBookings: Array<{
    id: string; reference: string; status: string; hotelRaw: string | null;
    confirmationNumber: string | null; securityApprovalRequired: boolean; notes: string | null;
    hotel: { id: string; name: string } | null;
    staySegments: Array<{
      id: string; checkIn: string | null; checkOut: string | null; nights: number | null;
      checkInRaw: string | null; checkOutRaw: string | null;
      hotel: { name: string } | null; hotelRaw: string | null;
      mealPlan: { name: string; nameAr: string | null } | null; mealPlanRaw: string | null;
      roomAllocations: Array<{ id: string; quantity: number; roomTypeRaw: string | null; roomType: { name: string } | null }>;
    }>;
  }>;
  transferBookings: Array<{
    id: string; reference: string; status: string; paxCount: number | null;
    legs: Array<{
      id: string; direction: string; status: string; serviceDate: string | null;
      pickupTimeMinutes: number | null; pickupTimeRaw: string | null; flightNumber: string | null;
      fromRaw: string | null; toRaw: string | null;
      fromLocation: { name: string } | null; toLocation: { name: string } | null;
      driver: { fullName: string } | null; vehicle: { plateNumber: string } | null;
    }>;
  }>;
  excursionBookings: Array<{
    id: string; reference: string; status: string; paxCount: number | null; childCount: number | null;
    legacyRestRaw: string | null; hotelRaw: string | null; hotel: { name: string } | null;
    items: Array<{
      id: string; status: string; serviceDate: string | null; activityRaw: string | null;
      transferRequired: boolean; catalogItem: { name: string; nameAr: string | null } | null;
    }>;
  }>;
  visaOrders: Array<{
    id: string; reference: string; status: string; originRaw: string | null;
    destinationRaw: string | null; paxCount: number | null; serviceDate: string | null;
    netAmount?: number | null; sellAmount?: number | null; currency: string;
  }>;
  financialDocuments: Array<{
    id: string; reference: string; status: string; totalAmount: string | number;
    currency: string; serviceDescription: string | null; dueDate: string | null;
    counterparty: { name: string } | null;
    payments: Array<{ id: string; amount: string | number; status: string; paymentDate: string }>;
  }>;
  attachments: Array<{ id: string; filename: string; category: string; createdAt: string }>;
  statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>;
  timeline: TimelineEvent[];
}

const EVENT_ICONS: Record<string, typeof Clock> = {
  HOTEL_CHECK_IN: CalendarCheck,
  HOTEL_CHECK_OUT: CalendarX,
  TRANSFER_ARRIVAL: ArrowDownLeft,
  TRANSFER_DEPARTURE: ArrowUpRight,
  TRANSFER_INTER_HOTEL: CarFront,
  TRANSFER_OTHER: CarFront,
  TRANSFER_EXCURSION: CarFront,
  EXCURSION: Ship,
  VISA: Globe2,
};

type TabKey = 'overview' | 'travelers' | 'hotels' | 'transfers' | 'excursions' | 'visa' | 'finance' | 'attachments' | 'timeline';

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('overview');

  const query = useQuery({
    queryKey: ['trip', params.id],
    queryFn: () => api.get<TripDetail>(`/trips/${params.id}`),
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) => api.post(`/trips/${params.id}/status`, { status }),
    onSuccess: () => {
      toast.success(t.common.save);
      void queryClient.invalidateQueries({ queryKey: ['trip', params.id] });
    },
    onError: (err) => toast.error(errorLabel(err, t)),
  });

  const trip = query.data;
  const canSeeFinance = can(PERMISSIONS.FINANCE_READ);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }
  if (!trip) return <p className="text-sm text-muted-foreground">{t.common.noResults}</p>;

  const allTabs: Array<{ key: TabKey; label: string; count?: number; visible: boolean }> = [
    { key: 'overview', label: t.trips.overview, visible: true },
    { key: 'travelers', label: t.trips.travelers, count: trip.travelers.length, visible: true },
    { key: 'hotels', label: t.trips.hotels, count: trip.hotelBookings.length, visible: can(PERMISSIONS.HOTELS_READ) },
    { key: 'transfers', label: t.trips.transfers, count: trip.transferBookings.length, visible: can(PERMISSIONS.TRANSFERS_READ) },
    { key: 'excursions', label: t.trips.excursions, count: trip.excursionBookings.length, visible: can(PERMISSIONS.EXCURSIONS_READ) },
    { key: 'visa', label: t.trips.visa, count: trip.visaOrders.length, visible: can(PERMISSIONS.VISAS_READ) },
    { key: 'finance', label: t.trips.finance, count: trip.financialDocuments.length, visible: canSeeFinance },
    { key: 'attachments', label: t.trips.attachments, count: trip.attachments.length, visible: true },
    { key: 'timeline', label: t.trips.timeline, visible: true },
  ];
  const tabs = allTabs.filter((x) => x.visible);

  // Group the derived timeline by day for the overview.
  const byDay = new Map<string, TimelineEvent[]>();
  for (const event of trip.timeline) {
    const key = event.date ?? '—';
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/trips" className="hover:text-foreground">
            {t.trips.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{trip.reference}</span>
            <Badge variant={statusVariant(trip.status)}>
              {t.status[trip.status as keyof typeof t.status] ?? trip.status}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>{trip.leadTraveler?.fullName ?? '—'}</span>
            {trip.partner ? <span>· {trip.partner.name}</span> : null}
            <span>
              · {formatDate(trip.travelStartDate, locale)} – {formatDate(trip.travelEndDate, locale)}
            </span>
          </span>
        }
        actions={
          can(PERMISSIONS.TRIPS_UPDATE) ? (
            <select
              value=""
              onChange={(e) => e.target.value && changeStatus.mutate(e.target.value)}
              disabled={changeStatus.isPending}
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
              aria-label={t.common.status}
            >
              <option value="">{t.common.status}…</option>
              {Object.values(TripFileStatus)
                .filter((s) => s !== trip.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {t.status[s as keyof typeof t.status] ?? s}
                  </option>
                ))}
            </select>
          ) : null
        }
      />

      {trip.legacySource?.workbook ? (
        <div className="mb-3 flex items-start gap-2 rounded-md border bg-info-subtle/50 px-3 py-2 text-xs text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t.common.source}: {trip.legacySource.workbook} · {trip.legacySource.sheet} ·{' '}
            {t.dataQuality.sourceRow} {trip.legacySource.row}
          </span>
        </div>
      ) : null}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b pb-px">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              tab === item.key
                ? 'border-brand-700 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 ? (
              <span className="ms-1.5 rounded bg-secondary px-1 py-0.5 text-2xs tabular-nums">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="border-b">
              <CardTitle>{t.trips.timeline}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {trip.timeline.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                  {t.trips.noServices}
                </p>
              ) : (
                <ol className="divide-y">
                  {[...byDay.entries()].map(([day, events]) => (
                    <li key={day} className="px-4 py-3">
                      <p className="mb-2 text-xs font-semibold tabular-nums">
                        {day === '—' ? t.common.notSet : formatDate(day, locale)}
                      </p>
                      <ul className="space-y-1.5 border-s ps-3">
                        {events.map((event) => {
                          const Icon = EVENT_ICONS[event.type] ?? Clock;
                          return (
                            <li
                              key={`${event.entityType}-${event.entityId}-${event.type}`}
                              className="flex items-start gap-2.5"
                            >
                              <span className="w-11 shrink-0 text-2xs tabular-nums text-muted-foreground">
                                {event.time ?? ''}
                              </span>
                              <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{event.title}</span>
                                {event.detail ? (
                                  <span className="block truncate text-2xs text-muted-foreground">
                                    {event.detail}
                                  </span>
                                ) : null}
                              </span>
                              {event.status ? (
                                <Badge variant={statusVariant(event.status)}>
                                  {t.status[event.status as keyof typeof t.status] ?? event.status}
                                </Badge>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>{t.trips.tripFile}</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <dl className="space-y-2 text-xs">
                  <Field label={t.trips.leadTraveler}>
                    {trip.leadTraveler ? (
                      <Link href={`/travelers/${trip.leadTraveler.id}`} className="text-primary hover:underline">
                        {trip.leadTraveler.fullName}
                      </Link>
                    ) : '—'}
                  </Field>
                  <Field label={t.common.phone}>
                    <span dir="ltr" className="tabular-nums">
                      {trip.leadTraveler?.phoneNormalized ?? trip.leadTraveler?.phoneRaw ?? '—'}
                    </span>
                  </Field>
                  <Field label={t.common.nationality}>
                    {(locale === 'ar' ? trip.leadTraveler?.nationality?.nameAr : trip.leadTraveler?.nationality?.name) ??
                      trip.leadTraveler?.nationalityRaw ?? '—'}
                  </Field>
                  <Field label={t.trips.agency}>{trip.partner?.name ?? '—'}</Field>
                  <Field label={t.trips.pax}>{trip.paxCount ?? '—'}</Field>
                  <Field label={t.trips.children}>{trip.childCount ?? '—'}</Field>
                  <Field label={t.trips.travelDates}>
                    <span className="tabular-nums">
                      {formatDate(trip.travelStartDate, locale)} – {formatDate(trip.travelEndDate, locale)}
                    </span>
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      {trip.travelDatesOverridden ? t.trips.datesOverridden : t.trips.datesDerived}
                    </span>
                  </Field>
                  {trip.notes ? <Field label={t.common.notes}>{trip.notes}</Field> : null}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'travelers' ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {trip.travelers.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <Link href={`/travelers/${member.traveler.id}`} className="text-sm hover:underline">
                    {member.traveler.fullName}
                  </Link>
                  <Badge variant="outline">{member.role}</Badge>
                </li>
              ))}
              {trip.travelers.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-muted-foreground">{t.common.noResults}</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'hotels' ? (
        <div className="space-y-3">
          {trip.hotelBookings.map((booking) => (
            <Card key={booking.id}>
              <CardHeader className="flex-row items-center justify-between border-b">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <Hotel className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{booking.hotel?.name ?? booking.hotelRaw ?? '—'}</span>
                  </CardTitle>
                  <p className="mt-0.5 text-2xs tabular-nums text-muted-foreground">{booking.reference}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {booking.securityApprovalRequired ? (
                    <Badge variant="warning">{t.hotels.securityApproval}</Badge>
                  ) : null}
                  <Badge variant={statusVariant(booking.status)}>
                    {t.status[booking.status as keyof typeof t.status] ?? booking.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.hotels.hotel}</th>
                        <th>{t.hotels.checkIn}</th>
                        <th>{t.hotels.checkOut}</th>
                        <th>{t.hotels.nights}</th>
                        <th>{t.hotels.roomType}</th>
                        <th>{t.hotels.mealPlan}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.staySegments.map((segment) => (
                        <tr key={segment.id}>
                          <td>{segment.hotel?.name ?? segment.hotelRaw ?? '—'}</td>
                          <td className="tabular-nums">
                            {formatDate(segment.checkIn, locale)}
                            {!segment.checkIn && segment.checkInRaw ? (
                              <span className="ms-1 text-2xs text-warning">({segment.checkInRaw})</span>
                            ) : null}
                          </td>
                          <td className="tabular-nums">
                            {formatDate(segment.checkOut, locale)}
                            {!segment.checkOut && segment.checkOutRaw ? (
                              <span className="ms-1 text-2xs text-warning">({segment.checkOutRaw})</span>
                            ) : null}
                          </td>
                          <td className="tabular-nums">{segment.nights ?? '—'}</td>
                          <td>
                            {segment.roomAllocations
                              .map((r) => `${r.quantity > 1 ? `${r.quantity} ` : ''}${r.roomType?.name ?? r.roomTypeRaw ?? ''}`.trim())
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </td>
                          <td>
                            {(locale === 'ar' ? segment.mealPlan?.nameAr : segment.mealPlan?.name) ??
                              segment.mealPlanRaw ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
          {trip.hotelBookings.length === 0 ? (
            <EmptyCard message={t.common.noResults} />
          ) : null}
        </div>
      ) : null}

      {tab === 'transfers' ? (
        <div className="space-y-3">
          {trip.transferBookings.map((booking) => (
            <Card key={booking.id}>
              <CardHeader className="flex-row items-center justify-between border-b">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CarFront className="size-3.5 text-muted-foreground" aria-hidden />
                    {booking.reference}
                  </CardTitle>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {t.trips.pax}: {booking.paxCount ?? '—'}
                  </p>
                </div>
                <Badge variant={statusVariant(booking.status)}>
                  {t.status[booking.status as keyof typeof t.status] ?? booking.status}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.common.date}</th>
                        <th>{t.transfers.pickup}</th>
                        <th>{t.common.from}</th>
                        <th>{t.common.to}</th>
                        <th>{t.transfers.flightNumber}</th>
                        <th>{t.transfers.driver}</th>
                        <th>{t.common.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.legs.map((leg) => (
                        <tr key={leg.id}>
                          <td className="tabular-nums">{formatDate(leg.serviceDate, locale)}</td>
                          <td className="tabular-nums">
                            {formatMinutes(leg.pickupTimeMinutes) ?? (
                              <span className="text-warning" title={t.transfers.originalPickupText}>
                                {leg.pickupTimeRaw ?? '—'}
                              </span>
                            )}
                          </td>
                          <td>{leg.fromLocation?.name ?? leg.fromRaw ?? '—'}</td>
                          <td>{leg.toLocation?.name ?? leg.toRaw ?? '—'}</td>
                          <td className="tabular-nums">{leg.flightNumber ?? '—'}</td>
                          <td>{leg.driver?.fullName ?? '—'}</td>
                          <td>
                            <Badge variant={statusVariant(leg.status)}>
                              {t.status[leg.status as keyof typeof t.status] ?? leg.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
          {trip.transferBookings.length === 0 ? <EmptyCard message={t.common.noResults} /> : null}
        </div>
      ) : null}

      {tab === 'excursions' ? (
        <div className="space-y-3">
          {trip.excursionBookings.map((booking) => (
            <Card key={booking.id}>
              <CardHeader className="flex-row items-center justify-between border-b">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Ship className="size-3.5 text-muted-foreground" aria-hidden />
                    {booking.reference}
                  </CardTitle>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {booking.hotel?.name ?? booking.hotelRaw ?? '—'} · {t.trips.pax}: {booking.paxCount ?? '—'}
                  </p>
                </div>
                <Badge variant={statusVariant(booking.status)}>
                  {t.status[booking.status as keyof typeof t.status] ?? booking.status}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {booking.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {(locale === 'ar' ? item.catalogItem?.nameAr : item.catalogItem?.name) ??
                            item.activityRaw ?? '—'}
                        </span>
                        <span className="block text-2xs tabular-nums text-muted-foreground">
                          {formatDate(item.serviceDate, locale)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {item.transferRequired ? (
                          <Badge variant="info">{t.excursions.transferRequired}</Badge>
                        ) : null}
                        <Badge variant={statusVariant(item.status)}>
                          {t.status[item.status as keyof typeof t.status] ?? item.status}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
                {booking.legacyRestRaw ? (
                  <div className="border-t bg-surface-muted px-4 py-2">
                    <p className="text-2xs text-muted-foreground">
                      <span className="font-medium">{t.excursions.legacyRest}:</span>{' '}
                      <span className="font-mono">{booking.legacyRestRaw}</span>
                    </p>
                    <p className="mt-0.5 text-2xs text-muted-foreground">{t.excursions.legacyRestHint}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {trip.excursionBookings.length === 0 ? <EmptyCard message={t.common.noResults} /> : null}
        </div>
      ) : null}

      {tab === 'visa' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.common.reference}</th>
                    <th>{t.visas.origin}</th>
                    <th>{t.visas.destination}</th>
                    <th>{t.trips.pax}</th>
                    <th>{t.common.date}</th>
                    {can(PERMISSIONS.VISAS_FINANCE_READ) ? (
                      <>
                        <th>{t.visas.net}</th>
                        <th>{t.visas.sell}</th>
                        <th>{t.visas.margin}</th>
                      </>
                    ) : null}
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {trip.visaOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="tabular-nums">{order.reference}</td>
                      <td>{order.originRaw ?? '—'}</td>
                      <td>{order.destinationRaw ?? '—'}</td>
                      <td className="tabular-nums">{order.paxCount ?? '—'}</td>
                      <td className="tabular-nums">{formatDate(order.serviceDate, locale)}</td>
                      {can(PERMISSIONS.VISAS_FINANCE_READ) ? (
                        <>
                          <td className="tabular-nums">{formatMoney(order.netAmount, order.currency, locale)}</td>
                          <td className="tabular-nums">{formatMoney(order.sellAmount, order.currency, locale)}</td>
                          <td className="tabular-nums">
                            {order.netAmount != null && order.sellAmount != null
                              ? formatMoney(Number(order.sellAmount) - Number(order.netAmount), order.currency, locale)
                              : '—'}
                          </td>
                        </>
                      ) : null}
                      <td>
                        <Badge variant={statusVariant(order.status)}>
                          {t.status[order.status as keyof typeof t.status] ?? order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {trip.visaOrders.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t.common.noResults}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'finance' && canSeeFinance ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.common.reference}</th>
                    <th>{t.finance.counterparty}</th>
                    <th>{t.finance.totalAmount}</th>
                    <th>{t.finance.paidAmount}</th>
                    <th>{t.finance.outstanding}</th>
                    <th>{t.finance.dueDate}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {trip.financialDocuments.map((doc) => {
                    // Paid comes from the ledger; the server derives it the same way.
                    const paid = doc.payments
                      .filter((p) => p.status === 'POSTED')
                      .reduce((sum, p) => sum + Number(p.amount), 0);
                    const total = Number(doc.totalAmount);
                    return (
                      <tr key={doc.id}>
                        <td className="tabular-nums">
                          <Link href={`/finance/payables/${doc.id}`} className="text-primary hover:underline">
                            {doc.reference}
                          </Link>
                        </td>
                        <td>{doc.counterparty?.name ?? doc.serviceDescription ?? '—'}</td>
                        <td className="tabular-nums">{formatMoney(total, doc.currency, locale)}</td>
                        <td className="tabular-nums">{formatMoney(paid, doc.currency, locale)}</td>
                        <td className="tabular-nums font-medium">
                          {formatMoney(total - paid, doc.currency, locale)}
                        </td>
                        <td className="tabular-nums">{formatDate(doc.dueDate, locale)}</td>
                        <td>
                          <Badge variant={statusVariant(doc.status)}>
                            {t.status[doc.status as keyof typeof t.status] ?? doc.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {trip.financialDocuments.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t.common.noResults}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'attachments' ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {trip.attachments.map((file) => (
                <li key={file.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Paperclip className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                  <Badge variant="outline">{file.category}</Badge>
                </li>
              ))}
              {trip.attachments.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-muted-foreground">{t.common.noResults}</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'timeline' ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {trip.statusHistory.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5">
                  <p className="text-sm">
                    {entry.fromStatus
                      ? `${t.status[entry.fromStatus as keyof typeof t.status] ?? entry.fromStatus} → `
                      : ''}
                    <span className="font-medium">
                      {t.status[entry.toStatus as keyof typeof t.status] ?? entry.toStatus}
                    </span>
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {formatDateTime(entry.createdAt, locale)}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </p>
                </li>
              ))}
              {trip.statusHistory.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-muted-foreground">{t.audit.noHistory}</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <FileText className="mx-auto size-6 text-muted-foreground/50" aria-hidden />
        <p className="mt-2 text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

/** Maps a server error code to its localised message. Not a hook. */
function errorLabel(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  const code = (error as { code?: string })?.code;
  return (code && (t.errors as Record<string, string>)[code]) || t.errors.INTERNAL_ERROR;
}
