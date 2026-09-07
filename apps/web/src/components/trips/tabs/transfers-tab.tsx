'use client';

import { CarFront } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDate, formatMinutes } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpTip } from '@/components/help/help-tip';
import type { TripTabContext } from '../types';

export function TransfersTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();

  if (trip.transferBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={CarFront}
            title={t.trips.noTransfers}
            description={t.trips.noTransfersHint}
          />
        </CardContent>
      </Card>
    );
  }

  return (
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
                {t.trips.pax}: {booking.paxCount ?? '—'} · {booking.legs.length} {t.transfers.legs}
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
                    <th>
                      <span className="inline-flex items-center gap-1">
                        {t.transfers.pickup}
                        <HelpTip helpKey="field.pickupTime" label={t.transfers.pickupTime} />
                      </span>
                    </th>
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
                      <td>
                        {leg.driver?.fullName ?? (
                          <span className="text-muted-foreground">{t.common.notSet}</span>
                        )}
                      </td>
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
    </div>
  );
}
