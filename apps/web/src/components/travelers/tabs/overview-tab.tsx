'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import type { TravelerTabContext } from '../types';

export function TravelerOverviewTab({ context }: { context: TravelerTabContext }) {
  const { traveler } = context;
  const { t, locale } = useI18n();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="border-b">
          <CardTitle>{t.nav.tripFiles}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {traveler.tripsAsLead.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t.travelers.noTrips}
              description={t.travelers.noTripsHint}
            />
          ) : (
            <ul className="divide-y">
              {traveler.tripsAsLead.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium tabular-nums">
                        {trip.reference}
                      </span>
                      <span className="block text-2xs tabular-nums text-muted-foreground">
                        {formatDate(trip.travelStartDate, locale)} –{' '}
                        {formatDate(trip.travelEndDate, locale)}
                        {trip.partner ? ` · ${trip.partner.name}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {trip._count.hotelBookings > 0 ? (
                        <Badge variant="outline">H {trip._count.hotelBookings}</Badge>
                      ) : null}
                      {trip._count.transferBookings > 0 ? (
                        <Badge variant="outline">T {trip._count.transferBookings}</Badge>
                      ) : null}
                      {trip._count.excursionBookings > 0 ? (
                        <Badge variant="outline">E {trip._count.excursionBookings}</Badge>
                      ) : null}
                      {trip._count.visaOrders > 0 ? (
                        <Badge variant="outline">V {trip._count.visaOrders}</Badge>
                      ) : null}
                      <Badge variant={statusVariant(trip.status)}>
                        {t.status[trip.status as keyof typeof t.status] ?? trip.status}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t.auth.profile}</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <dl className="space-y-2.5 text-xs">
            <Row label={t.common.name}>{traveler.fullName}</Row>
            {traveler.fullNameAr ? (
              <Row label={`${t.common.name} (AR)`}>{traveler.fullNameAr}</Row>
            ) : null}
            <Row label={t.common.phone}>
              <span dir="ltr" className="tabular-nums">
                {traveler.phoneNormalized ?? traveler.phoneRaw ?? '—'}
              </span>
            </Row>
            <Row label={t.common.nationality}>
              {(locale === 'ar' ? traveler.nationality?.nameAr : traveler.nationality?.name) ??
                traveler.nationalityRaw ?? '—'}
            </Row>
            <Row label={t.trips.agency}>{traveler.partner?.name ?? '—'}</Row>
            {traveler.email ? (
              <Row label={t.auth.email}>
                <span dir="ltr">{traveler.email}</span>
              </Row>
            ) : null}
            {traveler.notes ? <Row label={t.common.notes}>{traveler.notes}</Row> : null}
            {traveler.importRun ? (
              <Row label={t.common.source}>
                <span className="text-2xs">{traveler.importRun.sourceFilename}</span>
              </Row>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
