'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BedDouble, CarFront, FileBadge, TentTree } from 'lucide-react';
import { STATUSES, type CurrencyCode, type StatusCounts } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn, formatNumber, monthRange, todayIso } from '@/lib/utils';
import { PageHeader } from '@/components/layout/app-shell';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/shared/field';
import { Money } from '@/components/shared/format';
import { StatusDot } from '@/components/shared/status';
import { STATUS_STYLE } from '@/components/ui/badge';
import { ErrorState, RowsSkeleton } from '@/components/shared/feedback';
import { ExportButton } from '@/components/shared/list-controls';

interface Report {
  from: string;
  to: string;
  sales: {
    totals: Array<{ currency: CurrencyCode; count: number; totalSell: number; totalCost: number; totalProfit: number; commission: number; paid: number; remaining: number }>;
    bySeller: Array<{ seller: string; currency: CurrencyCode; count: number; totalSell: number; totalProfit: number; commission: number }>;
    counts: StatusCounts;
  };
  operations: {
    counts: Record<'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA', StatusCounts>;
    hotelNights: number;
    byAgency: Array<{ agency: string; hotels: number; transfers: number; excursions: number; visas: number; total: number }>;
  };
}

type Period = 'this-month' | 'last-month' | 'this-year' | 'custom';

export default function ReportsPage() {
  const { t, locale, statusLabel } = useI18n();
  const [period, setPeriod] = React.useState<Period>('this-month');
  const [custom, setCustom] = React.useState(monthRange(0));

  const range =
    period === 'this-month' ? monthRange(0)
      : period === 'last-month' ? monthRange(-1)
        : period === 'this-year' ? { from: `${todayIso().slice(0, 4)}-01-01`, to: `${todayIso().slice(0, 4)}-12-31` }
          : custom;

  const report = useQuery({
    queryKey: ['/reports', range.from, range.to],
    queryFn: () => api.get<Report>('/reports/summary', range),
    enabled: Boolean(range.from && range.to && range.from <= range.to),
  });
  const r = report.data;

  const opsCards: Array<{ key: 'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA'; label: string; icon: typeof BedDouble }> = [
    { key: 'HOTEL', label: t.nav.hotels, icon: BedDouble },
    { key: 'TRANSFER', label: t.nav.transfers, icon: CarFront },
    { key: 'EXCURSION', label: t.nav.excursions, icon: TentTree },
    { key: 'VISA', label: t.nav.visas, icon: FileBadge },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={BarChart3}
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={<ExportButton endpoint="/sales" params={{ dateBy: 'sale', dateFrom: range.from, dateTo: range.to }} />}
      />

      <div className="flex flex-wrap items-center gap-2 animate-rise [animation-delay:40ms]">
        <Segmented<Period>
          name="period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'this-month', label: t.reports.thisMonth },
            { value: 'last-month', label: t.reports.lastMonth },
            { value: 'this-year', label: t.reports.thisYear },
            { value: 'custom', label: t.reports.custom },
          ]}
        />
        {period === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label={t.common.from} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="w-auto" />
            <span className="text-muted-foreground">{t.common.arrow}</span>
            <Input type="date" aria-label={t.common.to} value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="w-auto" />
          </div>
        ) : null}
      </div>

      {report.isError ? <ErrorState error={report.error} onRetry={() => report.refetch()} /> : null}
      {!r ? (
        <RowsSkeleton rows={8} cols={4} />
      ) : (
        <>
          <Card className="animate-rise [animation-delay:80ms]">
            <CardHeader>
              <CardTitle>{t.reports.salesTitle}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {t.reports.salesCount}: {r.sales.counts.ALL - (r.sales.counts.CANCELLED ?? 0)}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {r.sales.totals.length ? (
                r.sales.totals.map((tot) => (
                  <div key={tot.currency} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {(
                      [
                        [t.sales.totalSell, tot.totalSell, ''],
                        [t.sales.totalCost, tot.totalCost, 'text-muted-foreground'],
                        [t.sales.totalProfit, tot.totalProfit, tot.totalProfit < 0 ? 'text-danger' : 'text-success'],
                        [t.sales.sellerCommission, tot.commission, ''],
                        [t.sales.paid, tot.paid, 'text-success'],
                        [t.sales.remaining, tot.remaining, tot.remaining > 0 ? 'text-sun-foreground dark:text-sun' : ''],
                      ] as const
                    ).map(([label, value, cls]) => (
                      <div key={label} className="rounded-lg bg-surface-muted px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <Money value={value} currency={tot.currency} className={cn('mt-0.5 block text-lg font-semibold', cls)} />
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{t.reports.noSales}</p>
              )}

              {r.sales.bySeller.length ? (
                <div>
                  <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">{t.reports.bySeller}</h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-muted text-[0.72rem] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-semibold">{t.reports.seller}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.reports.salesCount}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.sales.totalSell}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.sales.totalProfit}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.sales.sellerCommission}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {r.sales.bySeller.map((s) => (
                          <tr key={`${s.seller}-${s.currency}`}>
                            <td className="px-3 py-2 font-medium">{s.seller}</td>
                            <td className="px-3 py-2 text-end tabular">{s.count}</td>
                            <td className="px-3 py-2 text-end"><Money value={s.totalSell} currency={s.currency} /></td>
                            <td className="px-3 py-2 text-end"><Money value={s.totalProfit} currency={s.currency} signed /></td>
                            <td className="px-3 py-2 text-end"><Money value={s.commission} currency={s.currency} className="font-semibold" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="animate-rise [animation-delay:120ms]">
            <CardHeader>
              <CardTitle>{t.reports.opsTitle}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {t.reports.hotelNights}: <span className="tabular font-semibold text-foreground">{formatNumber(r.operations.hotelNights, locale)}</span>
              </span>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {opsCards.map((c) => {
                  const counts = r.operations.counts[c.key];
                  const total = counts.ALL || 1;
                  return (
                    <div key={c.key} className="rounded-lg border bg-surface p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <c.icon className="size-4 text-muted-foreground" />
                          {c.label}
                        </span>
                        <span className="tabular text-xl font-semibold">{counts.ALL}</span>
                      </div>
                      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                        {STATUSES.map((s) =>
                          counts[s] ? <div key={s} className={cn('h-full', STATUS_STYLE[s].dot)} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null,
                        )}
                      </div>
                      <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {STATUSES.filter((s) => counts[s]).map((s) => (
                          <li key={s} className="flex items-center gap-1.5">
                            <StatusDot status={s} />
                            {statusLabel(s, c.key)} <span className="tabular ms-auto text-foreground">{counts[s]}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {r.operations.byAgency.length ? (
                <div>
                  <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">{t.reports.byAgency}</h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-muted text-[0.72rem] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-semibold">{t.common.agency}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.nav.hotels}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.nav.transfers}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.nav.excursions}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.nav.visas}</th>
                          <th className="px-3 py-2 text-end font-semibold">{t.reports.bookings}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {r.operations.byAgency.map((a) => (
                          <tr key={a.agency}>
                            <td className="px-3 py-2 font-medium">{a.agency}</td>
                            {[a.hotels, a.transfers, a.excursions, a.visas].map((n, i) => (
                              <td key={i} className={cn('px-3 py-2 text-end tabular', !n && 'text-muted-foreground/50')}>{n}</td>
                            ))}
                            <td className="px-3 py-2 text-end tabular font-semibold">{a.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
