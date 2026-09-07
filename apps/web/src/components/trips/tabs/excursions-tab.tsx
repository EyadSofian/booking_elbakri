'use client';

import { Ship } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpTip } from '@/components/help/help-tip';
import type { TripTabContext } from '../types';

export function ExcursionsTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();

  if (trip.excursionBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Ship}
            title={t.trips.noExcursions}
            description={t.trips.noExcursionsHint}
          />
        </CardContent>
      </Card>
    );
  }

  return (
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
                {booking.hotel?.name ?? booking.hotelRaw ?? '—'} · {t.trips.pax}:{' '}
                {booking.paxCount ?? '—'}
                {booking.childCount ? ` +${booking.childCount}` : ''}
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
              // The REST column is shown verbatim: its business meaning was
              // never established, so nothing is inferred from it.
              <div className="border-t bg-surface-muted px-4 py-2">
                <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <span className="font-medium">{t.excursions.legacyRest}:</span>
                  <span className="font-mono">{booking.legacyRestRaw}</span>
                  <HelpTip helpKey="field.legacyRest" label={t.excursions.legacyRest} />
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
