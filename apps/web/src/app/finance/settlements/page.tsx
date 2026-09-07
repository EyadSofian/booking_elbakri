'use client';

import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDate, formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge, statusVariant } from '@/components/ui/badge';

interface SettlementRow {
  id: string;
  reference: string;
  status: string;
  currency: string;
  totalAmount: number | string;
  paidAmount?: number | string;
  outstanding?: number | string;
  description: string | null;
  descriptionAr: string | null;
  notes: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  settledAt: string | null;
  createdAt: string;
  partner: { id: string; name: string; nameAr: string | null } | null;
  legacySource: { workbook?: string; sheet?: string; row?: number } | null;
}

export default function SettlementsPage() {
  const { t, locale } = useI18n();
  const { state, update } = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });

  const query = useQuery({
    queryKey: ['settlements', state],
    queryFn: () =>
      api.get<PaginatedResponse<SettlementRow>>('/settlements', {
        page: state.page, pageSize: state.pageSize, ...state.filters,
      }),
  });

  const columns: Column<SettlementRow>[] = [
    {
      key: 'reference', header: t.common.reference, alwaysVisible: true, mobile: 'title',
      cell: (row) => <span className="font-medium tabular-nums">{row.reference}</span>,
    },
    {
      key: 'partner', header: t.nav.partners, mobile: 'subtitle',
      cell: (row) =>
        (locale === 'ar' ? row.partner?.nameAr : row.partner?.name) ?? row.partner?.name ?? '—',
    },
    {
      key: 'description', header: t.common.notes,
      cell: (row) => (
        // The SAMA sheet's notes are Arabic; both forms are kept and the right
        // one shown for the active locale.
        <span className="block max-w-80 truncate">
          {(locale === 'ar' ? row.descriptionAr : row.description) ??
            row.description ?? row.descriptionAr ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount', header: t.finance.totalAmount,
      cell: (row) => (
        <span className="font-medium tabular-nums">
          {formatMoney(row.totalAmount, row.currency, locale)}
        </span>
      ),
    },
    {
      key: 'period', header: t.reports.dateRange, defaultHidden: true,
      cell: (row) =>
        row.periodStart || row.periodEnd ? (
          <span className="tabular-nums">
            {formatDate(row.periodStart, locale)} – {formatDate(row.periodEnd, locale)}
          </span>
        ) : '—',
    },
    {
      key: 'settledAt', header: t.finance.paymentDate,
      cell: (row) => <span className="tabular-nums">{formatDate(row.settledAt, locale)}</span>,
    },
    {
      key: 'source', header: t.common.source, defaultHidden: true,
      cell: (row) =>
        row.legacySource?.sheet ? (
          <span className="text-2xs text-muted-foreground">
            {row.legacySource.sheet} · {row.legacySource.row}
          </span>
        ) : '—',
    },
    {
      key: 'status', header: t.common.status, mobile: 'hidden',
      cell: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {t.status[row.status as keyof typeof t.status] ?? row.status}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.finance.settlements}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
      />

      <div className="mb-3 flex items-start gap-2 rounded-md border bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Settlements are generic: every partner uses the same structure. The imported SAMA rows are
          simply settlements against a SAMA partner record.
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRefresh={() => query.refetch()}
      />
    </>
  );
}
