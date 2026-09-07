'use client';

import Link from 'next/link';
import { CarFront, Globe2, Hotel, Ship } from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import { useI18n, useSession } from '@/lib/providers';
import { formatDate, formatMinutes, formatMoney } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpTip } from '@/components/help/help-tip';
import type { TravelerTabContext } from '../types';

/** Links a service row back to the trip file that owns it. */
function TripLink({ trip }: { trip: { id: string; reference: string } | null }) {
  if (!trip) return <span className="text-muted-foreground">—</span>;
  return (
    <Link href={`/trips/${trip.id}`} className="tabular-nums text-primary hover:underline">
      {trip.reference}
    </Link>
  );
}

export function TravelerHotelsTab({ context }: { context: TravelerTabContext }) {
  const { traveler } = context;
  const { t, locale } = useI18n();

  if (traveler.hotelBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState icon={Hotel} title={t.travelers.noHotels} description={t.travelers.noHotelsHint} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.trips.tripFile}</th>
                <th>{t.hotels.hotel}</th>
                <th>{t.hotels.checkIn}</th>
                <th>{t.hotels.checkOut}</th>
                <th>{t.hotels.nights}</th>
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {traveler.hotelBookings.flatMap((booking) =>
                (booking.staySegments.length ? booking.staySegments : [null]).map((segment, i) => (
                  <tr key={`${booking.id}-${segment?.id ?? i}`}>
                    <td>{i === 0 ? <TripLink trip={booking.tripFile} /> : null}</td>
                    <td>
                      {segment?.hotel?.name ?? segment?.hotelRaw ??
                        booking.hotel?.name ?? booking.hotelRaw ?? '—'}
                    </td>
                    <td className="tabular-nums">
                      {segment?.checkIn ? formatDate(segment.checkIn, locale) : (
                        <span className="text-warning">{segment?.checkInRaw ?? '—'}</span>
                      )}
                    </td>
                    <td className="tabular-nums">
                      {segment?.checkOut ? formatDate(segment.checkOut, locale) : (
                        <span className="text-warning">{segment?.checkOutRaw ?? '—'}</span>
                      )}
                    </td>
                    <td className="tabular-nums">{segment?.nights ?? '—'}</td>
                    <td>
                      {i === 0 ? (
                        <Badge variant={statusVariant(booking.status)}>
                          {t.status[booking.status as keyof typeof t.status] ?? booking.status}
                        </Badge>
                      ) : null}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function TravelerTransfersTab({ context }: { context: TravelerTabContext }) {
  const { traveler } = context;
  const { t, locale } = useI18n();

  if (traveler.transferBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={CarFront}
            title={t.travelers.noTransfers}
            description={t.travelers.noTransfersHint}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.trips.tripFile}</th>
                <th>{t.common.date}</th>
                <th>{t.transfers.pickup}</th>
                <th>{t.common.from}</th>
                <th>{t.common.to}</th>
                <th>{t.transfers.flightNumber}</th>
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {traveler.transferBookings.flatMap((booking) =>
                booking.legs.map((leg, i) => (
                  <tr key={leg.id}>
                    <td>{i === 0 ? <TripLink trip={booking.tripFile} /> : null}</td>
                    <td className="tabular-nums">{formatDate(leg.serviceDate, locale)}</td>
                    <td className="tabular-nums">
                      {formatMinutes(leg.pickupTimeMinutes) ?? (
                        <span className="text-warning">{leg.pickupTimeRaw ?? '—'}</span>
                      )}
                    </td>
                    <td>{leg.fromLocation?.name ?? leg.fromRaw ?? '—'}</td>
                    <td>{leg.toLocation?.name ?? leg.toRaw ?? '—'}</td>
                    <td className="tabular-nums">{leg.flightNumber ?? '—'}</td>
                    <td>
                      <Badge variant={statusVariant(leg.status)}>
                        {t.status[leg.status as keyof typeof t.status] ?? leg.status}
                      </Badge>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function TravelerExcursionsTab({ context }: { context: TravelerTabContext }) {
  const { traveler } = context;
  const { t, locale } = useI18n();

  if (traveler.excursionBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Ship}
            title={t.travelers.noExcursions}
            description={t.travelers.noExcursionsHint}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {traveler.excursionBookings.map((booking) => (
        <Card key={booking.id}>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="text-xs">
                <TripLink trip={booking.tripFile} />
                <span className="ms-2 text-muted-foreground">
                  {booking.hotel?.name ?? booking.hotelRaw ?? ''}
                </span>
              </span>
              <Badge variant={statusVariant(booking.status)}>
                {t.status[booking.status as keyof typeof t.status] ?? booking.status}
              </Badge>
            </div>
            <ul className="divide-y">
              {booking.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0 truncate text-sm">
                    {(locale === 'ar' ? item.catalogItem?.nameAr : item.catalogItem?.name) ??
                      item.activityRaw ?? '—'}
                  </span>
                  <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                    {formatDate(item.serviceDate, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TravelerVisasTab({ context }: { context: TravelerTabContext }) {
  const { traveler } = context;
  const { t, locale } = useI18n();
  const { can } = useSession();
  const showAmounts = can(PERMISSIONS.VISAS_FINANCE_READ);

  if (traveler.visaOrders.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState icon={Globe2} title={t.travelers.noVisas} description={t.travelers.noVisasHint} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.trips.tripFile}</th>
                <th>{t.visas.origin}</th>
                <th>{t.visas.destination}</th>
                <th>{t.common.date}</th>
                <th>{t.trips.pax}</th>
                {showAmounts ? (
                  <th>
                    <span className="inline-flex items-center gap-1">
                      {t.visas.margin}
                      <HelpTip helpKey="field.visaMargin" label={t.visas.margin} />
                    </span>
                  </th>
                ) : null}
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {traveler.visaOrders.map((order) => (
                <tr key={order.id}>
                  <td><TripLink trip={order.tripFile} /></td>
                  <td>{order.originRaw ?? '—'}</td>
                  <td>{order.destinationRaw ?? '—'}</td>
                  <td className="tabular-nums">{formatDate(order.serviceDate, locale)}</td>
                  <td className="tabular-nums">{order.paxCount ?? '—'}</td>
                  {showAmounts ? (
                    <td className="tabular-nums font-medium">
                      {order.margin === null
                        ? '—'
                        : formatMoney(order.margin, order.currency, locale)}
                    </td>
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
      </CardContent>
    </Card>
  );
}
