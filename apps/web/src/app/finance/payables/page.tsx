'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  FinancialDocumentStatus, PERMISSIONS, type PaginatedResponse,
} from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDate, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface PayableRow {
  id: string;
  reference: string;
  status: string;
  currency: string;
  totalAmount: number | string;
  /** Derived by the server from the payment ledger, never stored. */
  paidAmount: number | string;
  outstanding: number | string;
  dueDate: string | null;
  serviceDate: string | null;
  serviceDescription: string | null;
  legacyRestRaw: string | null;
  hasReconciliationMismatch?: boolean;
  counterparty: { id: string; name: string; type: string } | null;
  tripFile: { id: string; reference: string } | null;
}

export default function PayablesPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'dueDate', sortDir: 'asc',
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useQuery({
    queryKey: ['financial-documents', state],
    queryFn: () =>
      api.get<PaginatedResponse<PayableRow>>('/financial-documents', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<PayableRow>[] = [
    {
      key: 'reference', header: t.common.reference, sortKey: 'reference',
      alwaysVisible: true, mobile: 'title',
      cell: (row) => <span className="font-medium tabular-nums">{row.reference}</span>,
    },
    {
      key: 'counterparty', header: t.finance.counterparty, mobile: 'subtitle',
      cell: (row) => (
        <span className="block max-w-56 truncate">
          {row.counterparty?.name ?? row.serviceDescription ?? '—'}
        </span>
      ),
    },
    {
      key: 'trip', header: t.trips.tripFile, defaultHidden: true,
      cell: (row) => row.tripFile?.reference ?? '—',
    },
    {
      key: 'total', header: t.finance.totalAmount, sortKey: 'totalAmount',
      cell: (row) => (
        <span className="tabular-nums">{formatMoney(row.totalAmount, row.currency, locale)}</span>
      ),
    },
    {
      key: 'paid', header: t.finance.paidAmount,
      cell: (row) => (
        <span className="tabular-nums text-success">
          {formatMoney(row.paidAmount, row.currency, locale)}
        </span>
      ),
    },
    {
      key: 'outstanding', header: t.finance.outstanding,
      cell: (row) => {
        const value = Number(row.outstanding);
        return (
          <span className={`font-medium tabular-nums ${value > 0 ? '' : 'text-muted-foreground'}`}>
            {formatMoney(row.outstanding, row.currency, locale)}
          </span>
        );
      },
    },
    {
      key: 'dueDate', header: t.finance.dueDate, sortKey: 'dueDate',
      cell: (row) => {
        const overdue =
          row.dueDate && Number(row.outstanding) > 0 && new Date(row.dueDate) < new Date();
        return (
          <span className={`tabular-nums ${overdue ? 'font-medium text-danger' : ''}`}>
            {formatDate(row.dueDate, locale)}
          </span>
        );
      },
    },
    {
      key: 'serviceDate', header: t.finance.serviceDate, sortKey: 'serviceDate', defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.serviceDate, locale)}</span>,
    },
    {
      key: 'legacyRest', header: t.finance.legacyRest, defaultHidden: true,
      cell: (row) =>
        row.legacyRestRaw ? (
          <span className="font-mono text-2xs">{row.legacyRestRaw}</span>
        ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'status', header: t.common.status, sortKey: 'status', mobile: 'hidden',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          {row.hasReconciliationMismatch ? (
            <Badge variant="warning" title={t.finance.mismatch}>
              <TriangleAlert className="size-3" aria-hidden />
            </Badge>
          ) : null}
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
          </Badge>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.finance.payables}
        description={t.finance.outstandingDerived}
        actions={
          can(PERMISSIONS.REPORTS_EXPORT) ? (
            <Button
              variant="outline" size="sm"
              onClick={() =>
                api.download('/reports/payables.xlsx', { ...state.filters, q: state.q || undefined })
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
        onRowClick={(row) => router.push(`/finance/payables/${row.id}`)}
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
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.common.filters}</span>
              {activeFilterCount > 0 ? <Badge variant="brand">{activeFilterCount}</Badge> : null}
            </Button>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                <X className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.clearFilters}</span>
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.common.filters}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="status">{t.common.status}</Label>
              <select id="status" value={state.filters.status ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                <option value="">{t.common.all}</option>
                {Object.values(FinancialDocumentStatus).map((s) => (
                  <option key={s} value={s}>{t.status[s as keyof typeof t.status] ?? s}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-3.5 accent-brand-700"
                checked={state.filters.onlyOutstanding === 'true'}
                onChange={(e) => update({ onlyOutstanding: e.target.checked ? 'true' : undefined })} />
              {t.finance.outstanding}
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-3.5 accent-brand-700"
                checked={state.filters.onlyOverdue === 'true'}
                onChange={(e) => update({ onlyOverdue: e.target.checked ? 'true' : undefined })} />
              {t.finance.overdue}
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-3.5 accent-brand-700"
                checked={state.filters.onlyMismatched === 'true'}
                onChange={(e) => update({ onlyMismatched: e.target.checked ? 'true' : undefined })} />
              {t.finance.mismatch}
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>{t.common.clearFilters}</Button>
            <Button onClick={() => setFiltersOpen(false)}>{t.common.apply}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
