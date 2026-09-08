'use client';

import Link from 'next/link';
import { Hotel, TriangleAlert } from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import { useI18n, useSession } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import { HelpTip } from '@/components/help/help-tip';
import { addServiceHref, type TripTabContext } from '../types';

export function HotelsTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();
  const { can } = useSession();

  if (trip.hotelBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Hotel}
            title={t.trips.noHotels}
            description={t.trips.noHotelsHint}
            action={
              can(PERMISSIONS.HOTELS_CREATE) ? (
                <Button size="sm" asChild>
                  <Link href={addServiceHref('/hotel-bookings', trip.id)}>
                    {t.hotels.newBooking}
                  </Link>
                </Button>
              ) : null
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {trip.hotelBookings.map((booking) => (
        <Card key={booking.id}>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Hotel className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{booking.hotel?.name ?? booking.hotelRaw ?? '—'}</span>
              </CardTitle>
              <p className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                {booking.reference}
                {booking.confirmationNumber ? ` · ${booking.confirmationNumber}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {booking.securityApprovalRequired ? (
                <span className="flex items-center">
                  <Badge variant="warning">{t.hotels.securityApproval}</Badge>
                  <HelpTip helpKey="field.securityApproval" label={t.hotels.securityApproval} />
                </span>
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
                        <LegacyDate value={segment.checkIn} raw={segment.checkInRaw} locale={locale} />
                      </td>
                      <td className="tabular-nums">
                        <LegacyDate value={segment.checkOut} raw={segment.checkOutRaw} locale={locale} />
                      </td>
                      <td className="tabular-nums">{segment.nights ?? '—'}</td>
                      <td>
                        {segment.roomAllocations
                          .map((r) =>
                            `${r.quantity > 1 ? `${r.quantity} ` : ''}${r.roomType?.name ?? r.roomTypeRaw ?? ''}`.trim(),
                          )
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
    </div>
  );
}

/**
 * A date that could not be parsed shows the workbook's own text in amber,
 * rather than a blank cell that hides the problem.
 */
function LegacyDate({
  value, raw, locale,
}: {
  value: string | null;
  raw: string | null;
  locale: string;
}) {
  if (value) return <>{formatDate(value, locale)}</>;
  if (!raw) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-warning">
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      {raw}
      <HelpTip helpKey="field.rawValue" />
    </span>
  );
}
