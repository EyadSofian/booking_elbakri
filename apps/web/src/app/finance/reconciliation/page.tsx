'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatMoney } from '@/lib/utils';
import { useListQuery } from '@/hooks/use-list-query';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/** As returned by `GET /finance/reconciliation`. */
interface ReconRow {
  id: string;
  reference: string;
  currency?: string;
  counterparty: { id: string; name: string } | null;
  serviceDescription: string | null;
  legacyTotalRaw: string | null;
  legacyPaidRaw: string | null;
  legacyRestRaw: string | null;
  legacyStatusRaw: string | null;
  calculatedOutstanding: number | string;
  difference: number | string | null;
  mismatch: boolean;
  restLooksLikeSum: boolean;
  reason: string | null;
  importRun: { id: string; sourceFilename: string } | null;
  /** The data-quality issue raised for this mismatch, when one exists. */
  issue: { id: string; status: string; resolutionNotes: string | null } | null;
}

export default function ReconciliationPage() {
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const { state, update } = useListQuery({ pageSize: 50 });
  const [resolving, setResolving] = useState<ReconRow | null>(null);

  const query = useQuery({
    queryKey: ['finance', 'reconciliation', state],
    queryFn: () =>
      api.get<PaginatedResponse<ReconRow>>('/finance/reconciliation', {
        page: state.page, pageSize: state.pageSize, ...state.filters,
      }),
  });

  const resolve = useMutation({
    mutationFn: (body: { issueId: string; notes: string }) =>
      api.post(`/data-quality/${body.issueId}/resolve`, {
        status: 'RESOLVED',
        resolutionNotes: body.notes,
      }),
    onSuccess: () => {
      toast.success(t.dataQuality.resolve);
      setResolving(null);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'reconciliation'] });
      void queryClient.invalidateQueries({ queryKey: ['data-quality'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: Column<ReconRow>[] = [
    {
      key: 'reference', header: t.common.reference, alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <Link href={`/finance/payables/${row.id}`} className="font-medium tabular-nums text-primary hover:underline">
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'counterparty', header: t.finance.counterparty, mobile: 'subtitle',
      cell: (row) => (
        <span className="block max-w-48 truncate">
          {row.counterparty?.name ?? row.serviceDescription ?? '—'}
        </span>
      ),
    },
    // The legacy figures are shown exactly as the workbook recorded them.
    {
      key: 'legacyTotal', header: t.finance.legacyTotal,
      cell: (row) => <span className="font-mono text-2xs">{row.legacyTotalRaw ?? '—'}</span>,
    },
    {
      key: 'legacyPaid', header: t.finance.legacyPaid,
      cell: (row) => <span className="font-mono text-2xs">{row.legacyPaidRaw ?? '—'}</span>,
    },
    {
      key: 'legacyRest', header: t.finance.legacyRest,
      cell: (row) => <span className="font-mono text-2xs">{row.legacyRestRaw ?? '—'}</span>,
    },
    {
      key: 'calculated', header: t.finance.calculatedOutstanding,
      cell: (row) => (
        <span className="font-medium tabular-nums">
          {formatMoney(row.calculatedOutstanding, row.currency ?? 'EGP', locale)}
        </span>
      ),
    },
    {
      key: 'difference', header: t.finance.difference,
      cell: (row) =>
        row.difference === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="font-medium tabular-nums text-warning">
            {formatMoney(row.difference, row.currency ?? 'EGP', locale)}
          </span>
        ),
    },
    {
      key: 'reason', header: t.dataQuality.suggestion,
      cell: (row) =>
        row.restLooksLikeSum ? (
          <span className="text-2xs text-warning">{t.finance.restLooksLikeSum}</span>
        ) : (
          <span className="text-2xs text-muted-foreground">{row.reason ?? '—'}</span>
        ),
    },
    {
      key: 'source', header: t.common.source, defaultHidden: true,
      cell: (row) =>
        row.importRun ? (
          <span className="block max-w-40 truncate text-2xs text-muted-foreground">
            {row.importRun.sourceFilename}
          </span>
        ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'status', header: t.common.status, mobile: 'hidden',
      cell: (row) => {
        const status = row.issue?.status;
        if (!status || status === 'OPEN' || status === 'REVIEWING') {
          return (
            <span className="flex items-center gap-1.5">
              <Badge variant="warning">
                <TriangleAlert className="size-3" aria-hidden />
                {t.finance.mismatch}
              </Badge>
              {can(PERMISSIONS.FINANCE_RECONCILE) && row.issue ? (
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setResolving(row); }}>
                  {t.dataQuality.resolve}
                </Button>
              ) : null}
            </span>
          );
        }
        return (
          <Badge variant="success" title={row.issue?.resolutionNotes ?? undefined}>
            <CheckCircle2 className="size-3" aria-hidden />
            {t.status[status as keyof typeof t.status] ?? status}
          </Badge>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        guideKey="page.finance"
        title={t.finance.reconciliation}
        description={query.data ? `${query.data.meta.total} ${t.finance.mismatch.toLowerCase()}` : undefined}
      />

      <div className="mb-3 flex items-start gap-2 rounded-md border bg-info-subtle/50 px-3 py-2.5 text-xs text-info">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t.finance.reconciliationHint}</span>
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
        emptyMessage={t.finance.matches}
        emptyHint={t.dataQuality.noIssues}
      />

      <Dialog open={Boolean(resolving)} onOpenChange={(open) => !open && setResolving(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.dataQuality.resolve}</DialogTitle>
          </DialogHeader>
          {resolving ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                if (resolving.issue) {
                  resolve.mutate({ issueId: resolving.issue.id, notes: String(form.get('notes')) });
                }
              }}
            >
              <DialogBody className="space-y-3">
                <dl className="grid grid-cols-2 gap-2 rounded-md bg-surface-muted p-3 text-2xs">
                  <div>
                    <dt className="text-muted-foreground">{t.finance.legacyRest}</dt>
                    <dd className="font-mono">{resolving.legacyRestRaw ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t.finance.calculatedOutstanding}</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(resolving.calculatedOutstanding, resolving.currency ?? 'EGP', locale)}
                    </dd>
                  </div>
                </dl>
                <p className="text-2xs text-muted-foreground">{t.finance.reconciliationHint}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" required>{t.dataQuality.resolutionNotes}</Label>
                  <Textarea id="notes" name="notes" rows={3} required minLength={3} />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResolving(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={resolve.isPending}>{t.dataQuality.resolve}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
