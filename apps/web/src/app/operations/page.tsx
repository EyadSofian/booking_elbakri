'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowUpRight, CalendarCheck, CalendarX, CarFront, ChevronLeft,
  ChevronRight, Clock, LayoutList, Ship, Table2, TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { addDaysIso, cn, formatDate, todayIso } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TimelineEvent {
  time: string | null;
  type: string;
  title: string;
  subtitle: string | null;
  traveler: { id: string; fullName: string; phoneRaw: string | null } | null;
  partner: { id: string; name: string } | null;
  tripFile: { id: string; reference: string } | null;
  entityType: string;
  entityId: string;
  status: string | null;
  meta: Record<string, unknown>;
}

const EVENT_ICONS: Record<string, typeof Clock> = {
  AIRPORT_PICKUP: ArrowDownLeft,
  AIRPORT_DROPOFF: ArrowUpRight,
  TRANSFER: CarFront,
  HOTEL_CHECK_IN: CalendarCheck,
  HOTEL_CHECK_OUT: CalendarX,
  EXCURSION: Ship,
};

type Section = 'all' | 'arrivals' | 'departures' | 'hotel' | 'excursions';

/**
 * The high-density day sheet the operations desk works from.
 *
 * One date, every service type, in chronological order — the question this
 * screen answers is "what has to happen today, and what is not ready".
 */
export default function OperationsPage() {
  const { t, locale, dir } = useI18n();
  const [date, setDate] = useState(todayIso());
  const [section, setSection] = useState<Section>('all');
  const [view, setView] = useState<'timeline' | 'table'>('timeline');

  const query = useQuery({
    queryKey: ['operations', 'today', date],
    queryFn: () =>
      api.get<{ date: string; events: TimelineEvent[]; counts: Record<string, number> }>(
        '/operations/today',
        { date },
      ),
  });

  const events = (query.data?.events ?? []).filter((event) => {
    switch (section) {
      case 'arrivals': return event.type === 'AIRPORT_PICKUP';
      case 'departures': return event.type === 'AIRPORT_DROPOFF';
      case 'hotel': return event.type === 'HOTEL_CHECK_IN' || event.type === 'HOTEL_CHECK_OUT';
      case 'excursions': return event.type === 'EXCURSION';
      default: return true;
    }
  });

  const sections: Array<{ key: Section; label: string; count: number }> = [
    { key: 'all', label: t.common.all, count: query.data?.events.length ?? 0 },
    { key: 'arrivals', label: t.dashboard.arrivalsToday, count: query.data?.events.filter((e) => e.type === 'AIRPORT_PICKUP').length ?? 0 },
    { key: 'departures', label: t.dashboard.departuresToday, count: query.data?.events.filter((e) => e.type === 'AIRPORT_DROPOFF').length ?? 0 },
    { key: 'hotel', label: t.nav.hotelBookings, count: (query.data?.counts.checkIns ?? 0) + (query.data?.counts.checkOuts ?? 0) },
    { key: 'excursions', label: t.nav.excursions, count: query.data?.counts.excursions ?? 0 },
  ];

  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <>
      <PageHeader
        title={t.nav.todaysOperations}
        description={formatDate(date, locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon-sm" onClick={() => setDate(addDaysIso(date, -1))} aria-label={t.common.previous}>
              <PrevIcon className="size-3.5" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
              className="h-8 w-36 text-xs"
            />
            <Button variant="outline" size="icon-sm" onClick={() => setDate(addDaysIso(date, 1))} aria-label={t.common.next}>
              <NextIcon className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>
              {t.common.today}
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {sections.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                section === item.key
                  ? 'border-brand-300 bg-accent font-medium text-accent-foreground'
                  : 'bg-surface text-muted-foreground hover:bg-accent/40',
              )}
            >
              {item.label}
              <span className="tabular-nums opacity-70">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-md border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setView('timeline')}
            className={cn('rounded p-1.5', view === 'timeline' ? 'bg-secondary' : 'text-muted-foreground')}
            aria-label={t.trips.timeline}
          >
            <LayoutList className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={cn('rounded p-1.5', view === 'table' ? 'bg-secondary' : 'text-muted-foreground')}
            aria-label={t.common.view}
          >
            <Table2 className="size-3.5" />
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Clock className="mx-auto size-7 text-muted-foreground/50" aria-hidden />
            <p className="mt-2 text-sm">{t.dashboard.noEventsToday}</p>
          </CardContent>
        </Card>
      ) : view === 'timeline' ? (
        <Card>
          <CardContent className="p-0">
            <ol className="divide-y">
              {events.map((event) => {
                const Icon = EVENT_ICONS[event.type] ?? Clock;
                const missingPickup = event.meta?.missingPickupTime === true;
                const driver = event.meta?.driver as { fullName: string } | null | undefined;
                return (
                  <li key={`${event.entityType}-${event.entityId}`}>
                    <Link
                      href={event.tripFile ? `/trips/${event.tripFile.id}` : '#'}
                      className="flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
                    >
                      <span className="flex items-center gap-3 sm:contents">
                        <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                          {event.time ?? '—'}
                        </span>
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{event.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            event.traveler?.fullName,
                            event.traveler?.phoneRaw,
                            event.subtitle,
                            event.partner?.name,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {typeof event.meta?.pax === 'number' ? (
                          <Badge variant="outline">{t.trips.pax} {event.meta.pax as number}</Badge>
                        ) : null}
                        {driver ? <Badge variant="outline">{driver.fullName}</Badge> : null}
                        {missingPickup ? (
                          <Badge variant="warning" title={String(event.meta?.pickupTimeRaw ?? '')}>
                            <TriangleAlert className="size-3" aria-hidden />
                            {t.transfers.pickupTime}
                          </Badge>
                        ) : null}
                        {event.meta?.securityApprovalRequired ? (
                          <Badge variant="info">{t.hotels.securityApproval}</Badge>
                        ) : null}
                        {event.status ? (
                          <Badge variant={statusVariant(event.status)}>
                            {t.status[event.status as keyof typeof t.status] ?? event.status}
                          </Badge>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.common.time}</th>
                    <th>{t.audit.action}</th>
                    <th>{t.trips.leadTraveler}</th>
                    <th>{t.common.phone}</th>
                    <th>{t.common.notes}</th>
                    <th>{t.trips.agency}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={`${event.entityType}-${event.entityId}`}>
                      <td className="tabular-nums font-medium">{event.time ?? '—'}</td>
                      <td>{event.type.replace(/_/g, ' ')}</td>
                      <td>{event.traveler?.fullName ?? '—'}</td>
                      <td dir="ltr" className="tabular-nums">{event.traveler?.phoneRaw ?? '—'}</td>
                      <td className="max-w-64 truncate">{event.title}</td>
                      <td>{event.partner?.name ?? '—'}</td>
                      <td>
                        {event.status ? (
                          <Badge variant={statusVariant(event.status)}>
                            {t.status[event.status as keyof typeof t.status] ?? event.status}
                          </Badge>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
