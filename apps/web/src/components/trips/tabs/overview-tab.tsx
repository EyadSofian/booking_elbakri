'use client';

import Link from 'next/link';
import {
  ArrowDownLeft, ArrowUpRight, CalendarCheck, CalendarX, CarFront, Clock, Globe2, Ship,
} from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpTip } from '@/components/help/help-tip';
import type { TimelineEvent, TripTabContext } from '../types';

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

export function OverviewTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();

  // The timeline is built by the server from the actual child services, so it
  // reflects what is really booked rather than a stored copy that could drift.
  const byDay = new Map<string, TimelineEvent[]>();
  for (const event of trip.timeline) {
    const key = event.date ?? '—';
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="border-b">
          <CardTitle>{t.trips.timeline}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {trip.timeline.length === 0 ? (
            <EmptyState title={t.trips.noServices} description={t.trips.datesDerived} />
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

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t.trips.tripFile}</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <dl className="space-y-2 text-xs">
            <Field label={t.trips.leadTraveler}>
              {trip.leadTraveler ? (
                <Link
                  href={`/travelers/${trip.leadTraveler.id}`}
                  className="text-primary hover:underline"
                >
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
              {(locale === 'ar'
                ? trip.leadTraveler?.nationality?.nameAr
                : trip.leadTraveler?.nationality?.name) ??
                trip.leadTraveler?.nationalityRaw ?? '—'}
            </Field>
            <Field label={t.trips.agency}>{trip.partner?.name ?? '—'}</Field>
            <Field label={t.trips.pax}>{trip.paxCount ?? '—'}</Field>
            <Field label={t.trips.children}>{trip.childCount ?? '—'}</Field>
            <Field label={t.trips.travelDates} helpKey="field.derivedTravelDates">
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
  );
}

function Field({
  label, children, helpKey,
}: {
  label: string;
  children: React.ReactNode;
  helpKey?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-2xs uppercase tracking-wide text-muted-foreground">
        {label}
        {helpKey ? <HelpTip helpKey={helpKey} label={label} /> : null}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
