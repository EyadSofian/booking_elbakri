'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlarmClock, ArrowRight, BedDouble, CarFront, FileBadge, Hotel, LogIn, LogOut, ShoppingBag, TentTree, UserX,
} from 'lucide-react';
import type { DashboardData, EntityType, Status } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useInvalidate } from '@/lib/queries';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/shared/field';
import { StatusMenu } from '@/components/shared/status';
import { DateText, Money, RefTag, Txt } from '@/components/shared/format';
import { EmptyState, ErrorState, RowsSkeleton } from '@/components/shared/feedback';
import { ENTITY_ROUTE } from '@/components/layout/global-search';
import { RouteText } from '@/components/ops/transfers';

const ENDPOINT: Record<Exclude<EntityType, 'SALE'>, string> = {
  HOTEL: '/hotel-bookings',
  TRANSFER: '/transfers',
  EXCURSION: '/excursions',
  VISA: '/visas',
};

const TYPE_ICON: Record<EntityType, typeof Hotel> = {
  SALE: ShoppingBag,
  HOTEL: BedDouble,
  TRANSFER: CarFront,
  EXCURSION: TentTree,
  VISA: FileBadge,
};

export default function DashboardPage() {
  const { t, locale, errorMessage } = useI18n();
  const { user, is } = useSession();
  const invalidate = useInvalidate();
  const [day, setDay] = React.useState<'today' | 'tomorrow'>('today');

  const data = useQuery({
    queryKey: ['/dashboard', day],
    queryFn: () => api.get<DashboardData>('/dashboard', { day }),
    refetchInterval: 60_000,
  });

  const setStatus = useMutation({
    mutationFn: ({ type, id, status }: { type: Exclude<EntityType, 'SALE'>; id: string; status: Status }) =>
      api.patch(`${ENDPOINT[type]}/${id}/status`, { status }),
    onSuccess: (_d, v) => {
      toast.success(t.common.statusChanged);
      invalidate(ENDPOINT[v.type]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const d = data.data;
  const firstName = user?.name.split(' ')[0] ?? '';
  const dayParam = day === 'today' ? 'today' : 'tomorrow';

  const tiles = d
    ? [
        { label: t.dashboard.checkIns, value: d.counts.checkIns, icon: LogIn, href: `/hotels?when=${dayParam}` },
        { label: t.dashboard.checkOuts, value: d.counts.checkOuts, icon: LogOut, href: `/hotels?when=all&departing=${dayParam}` },
        { label: t.dashboard.transfers, value: d.counts.transfers, icon: CarFront, href: `/transfers?when=${dayParam}` },
        { label: t.dashboard.excursions, value: d.counts.excursions, icon: TentTree, href: `/excursions?when=${dayParam}` },
        { label: t.dashboard.openRequests, value: d.counts.openRequests, icon: AlarmClock, href: '#requests', accent: true },
        { label: t.dashboard.unassigned, value: d.counts.unassignedTransfers, icon: UserX, href: '/transfers?assigned=no' },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <p className="text-sm text-muted-foreground">
            {formatDate(d?.day ?? null, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.hello(firstName)}</h1>
          <p className="text-sm text-muted-foreground">{day === 'today' ? t.dashboard.todayIs : t.dashboard.tomorrowIs}</p>
        </div>
        <Segmented
          name="day"
          value={day}
          onChange={setDay}
          options={[
            { value: 'today', label: t.common.today },
            { value: 'tomorrow', label: t.common.tomorrow },
          ]}
        />
      </div>

      {/* Register anything in one click */}
      <div className="flex flex-wrap gap-2 animate-rise [animation-delay:40ms]">
        {[
          { href: '/sales/new', label: t.dashboard.newSale, icon: ShoppingBag, show: is('SALES') },
          { href: '/hotels?new=1', label: t.dashboard.newHotel, icon: Hotel, show: true },
          { href: '/transfers?new=1', label: t.dashboard.newTransfer, icon: CarFront, show: true },
          { href: '/excursions?new=1', label: t.dashboard.newExcursion, icon: TentTree, show: true },
          { href: '/visas?new=1', label: t.dashboard.newVisa, icon: FileBadge, show: true },
        ]
          .filter((a) => a.show)
          .map((a) => (
            <Button key={a.href} variant="outline" asChild className="h-10 gap-2 rounded-full bg-surface px-4">
              <Link href={a.href}>
                <span className="grid size-6 place-items-center rounded-full bg-sun-subtle text-sun-foreground">
                  <a.icon className="size-3.5" />
                </span>
                {t.dashboard.quick} {a.label}
              </Link>
            </Button>
          ))}
      </div>

      {data.isError ? <ErrorState error={data.error} onRetry={() => data.refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {d
          ? tiles.map((tile, i) => (
              <Link
                key={tile.label}
                href={tile.href}
                style={{ animationDelay: `${60 + i * 35}ms` }}
                className={cn(
                  'group rounded-xl border bg-card px-4 py-3.5 shadow-xs transition-all animate-rise hover:-translate-y-0.5 hover:shadow-md',
                  tile.accent && tile.value > 0 && 'border-sun/40 bg-sun-subtle/60',
                )}
              >
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs">{tile.label}</span>
                  <tile.icon className={cn('size-4', tile.accent && tile.value > 0 && 'text-sun')} />
                </div>
                <p className={cn('tabular mt-1.5 text-3xl font-semibold', tile.value === 0 && 'text-muted-foreground/50')}>{tile.value}</p>
              </Link>
            ))
          : Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[88px] animate-pulse rounded-xl border bg-card" />)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* The transfer board, like an airport departures screen. */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs animate-rise [animation-delay:160ms]">
          <header className="flex items-center justify-between gap-3 bg-brand-900 px-4 py-3 text-white">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CarFront className="size-4 text-sun" />
              {t.dashboard.board}
            </h2>
            <Link href={`/transfers?when=${dayParam}`} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
              {t.common.view}
              <ArrowRight className="flip-rtl size-3" />
            </Link>
          </header>
          {!d ? (
            <RowsSkeleton rows={5} cols={5} />
          ) : !d.transfers.length ? (
            <EmptyState title={t.dashboard.boardEmpty} hint={null} icon={CarFront} />
          ) : (
            <ul className="divide-y">
              {d.transfers.map((x) => (
                <li key={x.id} className={cn('flex items-center gap-4 px-4 py-3', x.status === 'DONE' && 'opacity-60')}>
                  <span className="tabular w-14 shrink-0 font-mono text-lg font-semibold">{x.time ?? '--:--'}</span>
                  <Link href={ENTITY_ROUTE.TRANSFER(x.id)} className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      <Txt>{x.guestName}</Txt>
                    </span>
                    <RouteText from={x.fromPlace} to={x.toPlace} className="max-w-full text-xs text-muted-foreground" />
                  </Link>
                  <div className="hidden w-32 shrink-0 text-xs sm:block">
                    <p className="ltr font-mono">{x.flightNo ?? '—'}</p>
                    <p className={cn('truncate', x.driverName ? 'text-muted-foreground' : 'font-medium text-sun-foreground dark:text-sun')}>
                      {x.driverName ?? t.dashboard.noDriver}
                    </p>
                  </div>
                  <StatusMenu status={x.status} type="TRANSFER" onChange={(s) => setStatus.mutate({ type: 'TRANSFER', id: x.id, status: s })} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section id="requests" className="overflow-hidden rounded-xl border bg-card shadow-xs animate-rise [animation-delay:190ms]">
            <header className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{t.dashboard.requestsTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.dashboard.requestsHint}</p>
            </header>
            {!d ? (
              <RowsSkeleton rows={4} cols={3} />
            ) : !d.requests.length ? (
              <EmptyState title={t.dashboard.requestsEmpty} hint={null} icon={AlarmClock} />
            ) : (
              <ul className="scroll-thin max-h-[26rem] divide-y overflow-y-auto">
                {d.requests.map((r) => {
                  const Icon = TYPE_ICON[r.type];
                  return (
                    <li key={`${r.type}-${r.id}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted-foreground" title={t.entity[r.type]}>
                        <Icon className="size-4" />
                      </span>
                      <Link href={ENTITY_ROUTE[r.type](r.id)} className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            <Txt>{r.title}</Txt>
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <DateText value={r.date} /> {r.subtitle ? <>· <Txt>{r.subtitle}</Txt></> : ''}
                        </span>
                      </Link>
                      {r.type !== 'SALE' ? (
                        <StatusMenu status={r.status} type={r.type} onChange={(s) => setStatus.mutate({ type: r.type as Exclude<EntityType, 'SALE'>, id: r.id, status: s })} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {d?.month ? (
            <section className="rounded-xl border bg-card p-4 shadow-xs animate-rise [animation-delay:220ms]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t.dashboard.month}</h2>
                <Link href="/sales?when=this-month" className="text-xs text-primary hover:underline">
                  {t.dashboard.monthSales(d.month.sales)}
                </Link>
              </div>
              {d.month.sales ? (
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      [t.dashboard.monthSell, d.month.sell, ''],
                      [t.dashboard.monthProfit, d.month.profit, 'text-success'],
                      [t.dashboard.monthRemaining, d.month.remaining, 'text-sun-foreground dark:text-sun'],
                    ] as const
                  ).map(([label, rows, cls]) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {rows.map((m) => (
                        <Money key={m.currency} value={m.amount} currency={m.currency} className={cn('block text-base font-semibold', cls)} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.reports.noSales}</p>
              )}
            </section>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <MiniList
          title={t.dashboard.arrivals}
          icon={LogIn}
          empty={t.dashboard.noArrivals}
          loading={!d}
          rows={(d?.checkIns ?? []).map((h) => ({ id: h.id, ref: h.ref, status: h.status, title: h.guestName, sub: [h.hotel?.name, h.rooms].filter(Boolean).join(' · '), href: ENTITY_ROUTE.HOTEL(h.id) }))}
          type="HOTEL"
          onStatus={(id, s) => setStatus.mutate({ type: 'HOTEL', id, status: s })}
        />
        <MiniList
          title={t.dashboard.departures}
          icon={LogOut}
          empty={t.dashboard.noDepartures}
          loading={!d}
          rows={(d?.checkOuts ?? []).map((h) => ({ id: h.id, ref: h.ref, status: h.status, title: h.guestName, sub: h.hotel?.name ?? '', href: ENTITY_ROUTE.HOTEL(h.id) }))}
          type="HOTEL"
          onStatus={(id, s) => setStatus.mutate({ type: 'HOTEL', id, status: s })}
        />
        <MiniList
          title={t.nav.excursions}
          icon={TentTree}
          empty={t.dashboard.excursionsEmpty}
          loading={!d}
          rows={(d?.excursions ?? []).map((x) => ({ id: x.id, ref: x.ref, status: x.status, title: x.guestName, sub: [x.time, x.activity].filter(Boolean).join(' · '), href: ENTITY_ROUTE.EXCURSION(x.id) }))}
          type="EXCURSION"
          onStatus={(id, s) => setStatus.mutate({ type: 'EXCURSION', id, status: s })}
        />
      </div>
    </div>
  );
}

function MiniList({
  title,
  icon: Icon,
  empty,
  rows,
  loading,
  type,
  onStatus,
}: {
  title: string;
  icon: typeof Hotel;
  empty: string;
  rows: Array<{ id: string; ref: string; status: Status; title: string; sub: string; href: string }>;
  loading: boolean;
  type: EntityType;
  onStatus: (id: string, s: Status) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs animate-rise [animation-delay:250ms]">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="tabular ms-auto rounded-full bg-surface-sunken px-2 text-xs">{rows.length}</span>
      </header>
      {loading ? (
        <RowsSkeleton rows={3} cols={2} />
      ) : !rows.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="scroll-thin max-h-80 divide-y overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <Link href={r.href} className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <RefTag value={r.ref} />
                  <span className="truncate text-sm font-medium">
                    <Txt>{r.title}</Txt>
                  </span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  <Txt>{r.sub || '—'}</Txt>
                </span>
              </Link>
              <StatusMenu status={r.status} type={type} onChange={(s) => onStatus(r.id, s)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
