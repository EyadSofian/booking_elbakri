'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { formatDate, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/data/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';
import { HelpNotice } from '@/components/help/help-tip';

/** As returned by `GET /finance/overview`. */
interface Overview {
  openDocuments: number;
  totalPayable: number | string;
  totalPaid: number | string;
  totalOutstanding: number | string;
  overdueOutstanding: number | string;
  overdueCount: number;
  paymentsThisMonth: number | string;
  counterpartyBalances: Array<{
    counterpartyId: string | null;
    name: string;
    total: number | string;
    paid: number | string;
    outstanding: number | string;
  }>;
}

/** As returned by `GET /payments`. */
interface PaymentRow {
  id: string;
  reference: string;
  amount: number | string;
  currency: string;
  paymentDate: string;
  status: string;
  method: string | null;
  financialDocument: {
    id: string;
    reference: string;
    counterparty: { name: string } | null;
  } | null;
}

// Every amount in this system is EGP unless a record says otherwise; the
// overview aggregates across documents and so carries no single currency.
const DISPLAY_CURRENCY = 'EGP';

export default function FinanceOverviewPage() {
  const { t, locale } = useI18n();

  const overview = useQuery({
    queryKey: ['finance', 'overview'],
    queryFn: () => api.get<Overview>('/finance/overview'),
  });

  // Recent payments are a separate resource — the overview endpoint does not
  // carry them, and inventing that it did is what broke this page before.
  const payments = useQuery({
    queryKey: ['payments', 'recent'],
    queryFn: () =>
      api.get<PaginatedResponse<PaymentRow>>('/payments', {
        pageSize: 8,
        sortBy: 'paymentDate',
        sortDir: 'desc',
      }),
  });

  const mismatches = useQuery({
    queryKey: ['finance', 'reconciliation', 'count'],
    queryFn: () =>
      api.get<PaginatedResponse<unknown>>('/finance/reconciliation', { pageSize: 1 }),
  });

  const d = overview.data;
  const balances = d?.counterpartyBalances ?? [];
  const recent = payments.data?.data ?? [];
  const mismatchCount = mismatches.data?.meta.total ?? 0;

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

      <HelpNotice noticeKey="notice.outstandingDerived" />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatCard
          label={t.finance.totalOpenPayables}
          value={d?.openDocuments ?? 0}
          icon={Receipt}
          loading={overview.isLoading}
          href="/finance/payables?onlyOutstanding=true"
        />
        <StatCard
          label={t.finance.totalAmount}
          value={formatMoney(d?.totalPayable, DISPLAY_CURRENCY, locale)}
          icon={Scale}
          loading={overview.isLoading}
        />
        <StatCard
          label={t.finance.totalPaid}
          value={formatMoney(d?.totalPaid, DISPLAY_CURRENCY, locale)}
          icon={Wallet}
          tone="success"
          loading={overview.isLoading}
        />
        <StatCard
          label={t.finance.totalOutstanding}
          value={formatMoney(d?.totalOutstanding, DISPLAY_CURRENCY, locale)}
          icon={TrendingUp}
          loading={overview.isLoading}
          href="/finance/payables?onlyOutstanding=true"
        />
        <StatCard
          label={t.finance.overdueAmount}
          value={formatMoney(d?.overdueOutstanding, DISPLAY_CURRENCY, locale)}
          icon={AlertTriangle}
          tone={d && Number(d.overdueOutstanding) > 0 ? 'danger' : 'default'}
          hint={
            d && d.overdueCount > 0
              ? `${d.overdueCount} ${t.finance.payables.toLowerCase()}`
              : undefined
          }
          loading={overview.isLoading}
          href="/finance/payables?onlyOverdue=true"
        />
      </div>

      {mismatchCount > 0 ? (
        <Link
          href="/finance/reconciliation"
          className="mt-4 flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2.5 text-xs text-warning transition-colors hover:brightness-95"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">
              {mismatchCount} {t.finance.mismatch.toLowerCase()}
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
            {overview.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-8 w-full" />
                ))}
              </div>
            ) : balances.length === 0 ? (
              <EmptyState title={t.common.noResults} description={t.finance.noBalancesHint} />
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
                    {balances.map((row) => (
                      <tr key={row.counterpartyId ?? row.name}>
                        <td className="max-w-48 truncate">{row.name}</td>
                        <td className="text-end tabular-nums">
                          {formatMoney(row.total, DISPLAY_CURRENCY, locale)}
                        </td>
                        <td className="text-end tabular-nums text-success">
                          {formatMoney(row.paid, DISPLAY_CURRENCY, locale)}
                        </td>
                        <td className="text-end font-medium tabular-nums">
                          {formatMoney(row.outstanding, DISPLAY_CURRENCY, locale)}
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
            {payments.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-8 w-full" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState title={t.common.noResults} description={t.finance.noPaymentsHint} />
            ) : (
              <ul className="divide-y">
                {recent.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={
                        p.financialDocument
                          ? `/finance/payables/${p.financialDocument.id}`
                          : '/finance/payments'
                      }
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {p.financialDocument?.counterparty?.name ??
                            p.financialDocument?.reference ??
                            p.reference}
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
