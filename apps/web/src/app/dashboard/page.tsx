'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarCheck, CalendarX,
  CarFront, Clock, Globe2, Hotel, Receipt, Ship, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils';
import { PERMISSIONS } from '@elbakri/shared';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/data/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Summary {
  date: string;
  arrivalsToday: number;
  departuresToday: number;
  checkInsToday: number;
  checkOutsToday: number;
  transferPickupsToday: number;
  excursionsToday: number;
  pendingVisas: number;
  visasNearTravel: number;
  openTripFiles: number;
  unassignedTransfers: number;
  transfersMissingPickup: number;
  openDataQualityIssues: number;
  outstandingPayables: number;
  overduePayables: number;
  paymentsDueThisWeek: number;
}

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

interface Alerts {
  missingPickupTime: Array<{ entityId: string; serviceDate: string | null; pickupTimeRaw: string | null; reference: string; traveler: string | null; tripFile: { id: string } | null }>;
  unassignedTransfers: Array<{ entityId: string; serviceDate: string | null; reference: string; traveler: string | null; tripFile: { id: string } | null }>;
  checkoutBeforeCheckin: Array<{ entityId: string; checkIn: string; checkOut: string; reference: string }>;
  visasPendingNearTravel: Array<{ entityId: string; serviceDate: string | null; status: string; traveler: string | null; tripFile: { id: string } | null }>;
  overduePayables: Array<{ entityId: string; reference: string; counterparty: string | null; dueDate: string | null; outstanding: number }>;
  dataQualityErrors: Array<{ entityId: string; category: string; message: string; sourceSheet: string | null; sourceRow: number | null }>;
}

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
}

const EVENT_ICONS: Record<string, typeof Clock> = {
  AIRPORT_PICKUP: ArrowDownLeft,
  AIRPORT_DROPOFF: ArrowUpRight,
  TRANSFER: CarFront,
  HOTEL_CHECK_IN: CalendarCheck,
  HOTEL_CHECK_OUT: CalendarX,
  EXCURSION: Ship,
};

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { can } = useSession();

  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<Summary>('/dashboard/summary'),
  });

  const timeline = useQuery({
    queryKey: ['operations', 'today'],
    queryFn: () => api.get<{ date: string; events: TimelineEvent[]; counts: Record<string, number> }>('/operations/today'),
  });

  const alerts = useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: () => api.get<Alerts>('/dashboard/alerts'),
  });

  const activity = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => api.get<ActivityEntry[]>('/dashboard/activity'),
  });

  const s = summary.data;
  const canSeeFinance = can(PERMISSIONS.FINANCE_READ);

  const alertGroups = [
    { key: 'missingPickupTime', label: t.alerts.missingPickupTime, items: alerts.data?.missingPickupTime ?? [], href: '/transfers?missingPickupOnly=true', tone: 'warning' as const },
    { key: 'unassignedTransfers', label: t.alerts.unassignedTransfers, items: alerts.data?.unassignedTransfers ?? [], href: '/transfers?unassignedOnly=true', tone: 'warning' as const },
    { key: 'checkoutBeforeCheckin', label: t.alerts.checkoutBeforeCheckin, items: alerts.data?.checkoutBeforeCheckin ?? [], href: '/data-quality?category=DATE_ERROR', tone: 'danger' as const },
    { key: 'visasPendingNearTravel', label: t.alerts.visasPendingNearTravel, items: alerts.data?.visasPendingNearTravel ?? [], href: '/visas', tone: 'warning' as const },
    ...(canSeeFinance
      ? [{ key: 'overduePayables', label: t.alerts.overduePayables, items: alerts.data?.overduePayables ?? [], href: '/finance/payables?onlyOverdue=true', tone: 'danger' as const }]
      : []),
    { key: 'dataQualityErrors', label: t.alerts.dataQualityErrors, items: alerts.data?.dataQualityErrors ?? [], href: '/data-quality?severity=ERROR', tone: 'danger' as const },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        description={s ? s.date : undefined}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/operations">{t.nav.todaysOperations}</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={t.dashboard.arrivalsToday} value={formatNumber(s?.arrivalsToday, locale)}
          icon={ArrowDownLeft} loading={summary.isLoading} href="/transfers?direction=ARRIVAL"
        />
        <StatCard
          label={t.dashboard.departuresToday} value={formatNumber(s?.departuresToday, locale)}
          icon={ArrowUpRight} loading={summary.isLoading} href="/transfers?direction=DEPARTURE"
        />
        <StatCard
          label={t.dashboard.checkInsToday} value={formatNumber(s?.checkInsToday, locale)}
          icon={Hotel} loading={summary.isLoading} href="/hotel-bookings"
        />
        <StatCard
          label={t.dashboard.checkOutsToday} value={formatNumber(s?.checkOutsToday, locale)}
          icon={CalendarX} loading={summary.isLoading} href="/hotel-bookings"
        />
        <StatCard
          label={t.dashboard.excursionsToday} value={formatNumber(s?.excursionsToday, locale)}
          icon={Ship} loading={summary.isLoading} href="/excursions"
        />
        <StatCard
          label={t.dashboard.pendingVisas} value={formatNumber(s?.pendingVisas, locale)}
          icon={Globe2} loading={summary.isLoading}
          tone={s && s.visasNearTravel > 0 ? 'warning' : 'default'}
          hint={s && s.visasNearTravel > 0 ? `${s.visasNearTravel} within 7 days` : undefined}
          href="/visas"
        />
        <StatCard
          label={t.dashboard.openTripFiles} value={formatNumber(s?.openTripFiles, locale)}
          icon={CalendarCheck} loading={summary.isLoading} href="/trips"
        />
        <StatCard
          label={t.alerts.unassignedTransfers} value={formatNumber(s?.unassignedTransfers, locale)}
          icon={CarFront} loading={summary.isLoading}
          tone={s && s.unassignedTransfers > 0 ? 'warning' : 'default'}
          href="/transfers?unassignedOnly=true"
        />
        {canSeeFinance ? (
          <>
            <StatCard
              label={t.dashboard.outstandingPayables}
              value={formatMoney(s?.outstandingPayables, 'EGP', locale)}
              icon={Receipt} loading={summary.isLoading}
              tone={s && s.overduePayables > 0 ? 'danger' : 'default'}
              hint={s && s.overduePayables > 0 ? `${formatMoney(s.overduePayables, 'EGP', locale)} ${t.finance.overdue.toLowerCase()}` : undefined}
              href="/finance/payables?onlyOutstanding=true"
            />
            <StatCard
              label={t.dashboard.paymentsDue}
              value={formatMoney(s?.paymentsDueThisWeek, 'EGP', locale)}
              icon={Wallet} loading={summary.isLoading} href="/finance/payables"
            />
          </>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between border-b">
            <CardTitle>{t.dashboard.todaysTimeline}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/operations">{t.common.view}</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {timeline.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-10 w-full" />
                ))}
              </div>
            ) : (timeline.data?.events.length ?? 0) === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                {t.dashboard.noEventsToday}
              </p>
            ) : (
              <ul className="divide-y">
                {timeline.data!.events.slice(0, 12).map((event) => {
                  const Icon = EVENT_ICONS[event.type] ?? Clock;
                  const missingPickup = event.meta?.missingPickupTime === true;
                  return (
                    <li key={`${event.entityType}-${event.entityId}`}>
                      <Link
                        href={event.tripFile ? `/trips/${event.tripFile.id}` : '/operations'}
                        className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
                      >
                        <span className="w-11 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                          {event.time ?? '—'}
                        </span>
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{event.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[event.traveler?.fullName, event.subtitle, event.partner?.name]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {missingPickup ? (
                            <Badge variant="warning">{t.transfers.pickupTime}</Badge>
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
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                {t.dashboard.alerts}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {alerts.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="skeleton h-8 w-full" />
                  ))}
                </div>
              ) : alertGroups.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {t.dashboard.noAlerts}
                </p>
              ) : (
                <ul className="divide-y">
                  {alertGroups.map((group) => (
                    <li key={group.key}>
                      <Link
                        href={group.href}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-accent/40"
                      >
                        <span className="min-w-0 truncate text-xs">{group.label}</span>
                        <Badge variant={group.tone}>{group.items.length}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {can(PERMISSIONS.AUDIT_READ) ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>{t.dashboard.recentActivity}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {activity.isLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="skeleton h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y">
                    {(activity.data ?? []).slice(0, 8).map((entry) => (
                      <li key={entry.id} className="px-4 py-2">
                        <p className="truncate text-xs">
                          <span className="font-medium">{entry.actor?.fullName ?? 'System'}</span>{' '}
                          <span className="text-muted-foreground">{entry.action}</span>
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {formatDateTime(entry.createdAt, locale)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
