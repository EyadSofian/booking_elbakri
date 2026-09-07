'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDate, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PaymentRow {
  id: string;
  reference: string;
  amount: number | string;
  currency: string;
  paymentDate: string;
  method: string | null;
  paymentReference: string | null;
  status: string;
  reversalReason: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
  financialDocument: {
    id: string; reference: string;
    counterparty: { id: string; name: string } | null;
    tripFile: { id: string; reference: string } | null;
  } | null;
}

export default function PaymentsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'paymentDate', sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = useState(state.q);

  const query = useQuery({
    queryKey: ['payments', state],
    queryFn: () =>
      api.get<PaginatedResponse<PaymentRow>>('/payments', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<PaymentRow>[] = [
    {
      key: 'paymentDate', header: t.finance.paymentDate, sortKey: 'paymentDate',
      alwaysVisible: true, mobile: 'title',
      cell: (row) => <span className="tabular-nums">{formatDate(row.paymentDate, locale)}</span>,
    },
    {
      key: 'counterparty', header: t.finance.counterparty, mobile: 'subtitle',
      cell: (row) => (
        <span className="block max-w-56 truncate">
          {row.financialDocument?.counterparty?.name ?? row.financialDocument?.reference ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount', header: t.finance.amount, sortKey: 'amount',
      cell: (row) => {
        // A reversed original and its reversal entry both stay visible, so the
        // history explains itself rather than a balance simply changing.
        const muted = row.status === 'REVERSED';
        const negative = row.status === 'REVERSAL';
        return (
          <span
            className={`font-medium tabular-nums ${
              muted ? 'text-muted-foreground line-through' : negative ? 'text-danger' : ''
            }`}
          >
            {formatMoney(row.amount, row.currency, locale)}
          </span>
        );
      },
    },
    {
      key: 'method', header: t.finance.paymentMethod,
      cell: (row) => row.method ?? '—',
    },
    {
      key: 'paymentReference', header: t.finance.paymentReference, defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{row.paymentReference ?? '—'}</span>,
    },
    {
      key: 'document', header: t.finance.payable,
      cell: (row) => (
        <span className="tabular-nums">{row.financialDocument?.reference ?? '—'}</span>
      ),
    },
    {
      key: 'createdBy', header: t.audit.actor, defaultHidden: true,
      cell: (row) => row.createdBy?.fullName ?? '—',
    },
    {
      key: 'status', header: t.common.status, mobile: 'hidden',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
          </Badge>
          {row.reversalReason ? (
            <span className="max-w-32 truncate text-2xs text-muted-foreground" title={row.reversalReason}>
              {row.reversalReason}
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.nav.payments}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          can(PERMISSIONS.REPORTS_EXPORT) ? (
            <Button
              variant="outline" size="sm"
              onClick={() =>
                api.download('/reports/payments.xlsx', { ...state.filters, q: state.q || undefined })
                  .catch(() => toast.error(t.common.error))
              }
            >
              <Download className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.common.exportExcel}</span>
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        onRowClick={(row) =>
          row.financialDocument && router.push(`/finance/payables/${row.financialDocument.id}`)
        }
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSortChange={(sortBy, sortDir) => update({ sortBy, sortDir })}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRefresh={() => query.refetch()}
        mobileBadge={(row) => (
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
          </Badge>
        )}
        toolbar={
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); update({ q: searchInput }); }}
              className="relative min-w-0 flex-1 sm:max-w-xs"
            >
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.common.search}
                className="h-8 ps-8 text-xs"
              />
            </form>
            <Input
              type="date" aria-label={t.common.from}
              value={state.filters.dateFrom ?? ''}
              onChange={(e) => update({ dateFrom: e.target.value || undefined })}
              className="h-8 w-36 text-xs"
            />
            <Input
              type="date" aria-label={t.common.to}
              value={state.filters.dateTo ?? ''}
              onChange={(e) => update({ dateTo: e.target.value || undefined })}
              className="h-8 w-36 text-xs"
            />
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                <X className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.clearFilters}</span>
              </Button>
            ) : null}
          </>
        }
      />
    </>
  );
}
