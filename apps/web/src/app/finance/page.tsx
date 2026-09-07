'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Receipt, Scale, TrendingUp, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { formatDate, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/data/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Overview {
  currency: string;
  openDocuments: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueAmount: number;
  overdueCount: number;
  paymentsThisMonth: number;
  paymentsThisMonthCount: number;
  reconciliationMismatches: number;
  partnerBalances: Array<{
    partnerId: string | null;
    counterpartyId: string | null;
    name: string;
    total: number;
    paid: number;
    outstanding: number;
  }>;
  recentPayments: Array<{
    id: string;
    reference: string;
    amount: number | string;
    currency: string;
    paymentDate: string;
    status: string;
    method: string | null;
    financialDocument: { id: string; reference: string; counterparty: { name: string } | null } | null;
  }>;
}

export default function FinanceOverviewPage() {
  const { t, locale } = useI18n();

  const query = useQuery({
    queryKey: ['finance', 'overview'],
    queryFn: () => api.get<Overview>('/finance/overview'),
  });

  const d = query.data;
  const currency = d?.currency ?? 'EGP';

  return (
    <>
      <PageHeader
        guideKey="page.finance"
        title={t.finance.title}
        description={t.finance.outstandingDerived}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/finance/payables">{t.nav.payables}</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/finance/reconciliation">{t.nav.reconciliation}</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatCard
          label={t.finance.totalOpenPayables}
          value={d?.openDocuments ?? 0}
          icon={Receipt}
          loading={query.isLoading}
          href="/finance/payables?onlyOutstanding=true"
        />
        <StatCard
          label={t.finance.totalPaid}
          value={formatMoney(d?.totalPaid, currency, locale)}
          icon={Wallet}
          tone="success"
          loading={query.isLoading}
        />
        <StatCard
          label={t.finance.totalOutstanding}
          value={formatMoney(d?.totalOutstanding, currency, locale)}
          icon={TrendingUp}
          loading={query.isLoading}
          href="/finance/payables?onlyOutstanding=true"
        />
        <StatCard
          label={t.finance.overdueAmount}
          value={formatMoney(d?.overdueAmount, currency, locale)}
          icon={AlertTriangle}
          tone={d && d.overdueAmount > 0 ? 'danger' : 'default'}
          hint={d && d.overdueCount > 0 ? `${d.overdueCount} ${t.finance.payables.toLowerCase()}` : undefined}
          loading={query.isLoading}
          href="/finance/payables?onlyOverdue=true"
        />
        <StatCard
          label={t.finance.paymentsThisMonth}
          value={formatMoney(d?.paymentsThisMonth, currency, locale)}
          icon={Scale}
          hint={d ? `${d.paymentsThisMonthCount} ${t.nav.payments.toLowerCase()}` : undefined}
          loading={query.isLoading}
          href="/finance/payments"
        />
      </div>

      {d && d.reconciliationMismatches > 0 ? (
        <Link
          href="/finance/reconciliation"
          className="mt-4 flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2.5 text-xs text-warning transition-colors hover:brightness-95"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">
              {d.reconciliationMismatches} {t.finance.mismatch.toLowerCase()}
            </span>
            <span className="mt-0.5 block opacity-90">{t.finance.reconciliationHint}</span>
          </span>
        </Link>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t.finance.partnerBalances}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-8 w-full" />
                ))}
              </div>
            ) : (d?.partnerBalances.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">{t.common.noResults}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.finance.counterparty}</th>
                      <th className="text-end">{t.finance.totalAmount}</th>
                      <th className="text-end">{t.finance.paidAmount}</th>
                      <th className="text-end">{t.finance.outstanding}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d!.partnerBalances.map((p) => (
                      <tr key={p.counterpartyId ?? p.partnerId ?? p.name}>
                        <td className="max-w-48 truncate">{p.name}</td>
                        <td className="text-end tabular-nums">{formatMoney(p.total, currency, locale)}</td>
                        <td className="text-end tabular-nums text-success">
                          {formatMoney(p.paid, currency, locale)}
                        </td>
                        <td className="text-end font-medium tabular-nums">
                          {formatMoney(p.outstanding, currency, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <CardTitle>{t.finance.paymentHistory}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/finance/payments">{t.common.view}</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-8 w-full" />
                ))}
              </div>
            ) : (d?.recentPayments.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">{t.common.noResults}</p>
            ) : (
              <ul className="divide-y">
                {d!.recentPayments.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={p.financialDocument ? `/finance/payables/${p.financialDocument.id}` : '/finance/payments'}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {p.financialDocument?.counterparty?.name ?? p.financialDocument?.reference ?? p.reference}
                        </span>
                        <span className="block text-2xs tabular-nums text-muted-foreground">
                          {formatDate(p.paymentDate, locale)}
                          {p.method ? ` · ${p.method}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={`text-xs font-medium tabular-nums ${
                            p.status === 'POSTED' ? '' : 'text-muted-foreground line-through'
                          }`}
                        >
                          {formatMoney(p.amount, p.currency, locale)}
                        </span>
                        {p.status !== 'POSTED' ? (
                          <Badge variant={statusVariant(p.status)}>
                            {t.status[p.status as keyof typeof t.status] ?? p.status}
                          </Badge>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
