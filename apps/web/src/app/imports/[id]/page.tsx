'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, PlayCircle, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api, ApiError } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, severityVariant, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface SheetRow {
  id: string;
  sheetName: string;
  detectedKind: string | null;
  headerRow: number | null;
  maxRow: number;
  rowsScanned: number;
  columnMapping: Record<string, string> | null;
  unmappedColumns: string[];
  isEmpty: boolean;
  stats: {
    balanced: boolean; scanned: number; accountedFor: number;
    masterRecords: number; continuationRows: number;
    structuralRows: number; blankRows: number; orphanRows: number;
  } | null;
}

interface ImportRunDetail {
  id: string;
  sourceFilename: string;
  checksum: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  failedReason: string | null;
  rowsScanned: number;
  rowsBlank: number;
  rowsStructural: number;
  rowsMaster: number;
  rowsContinuation: number;
  rowsOrphan: number;
  recordsCreated: number;
  recordsMatched: number;
  warningCount: number;
  errorCount: number;
  reconciliation: {
    sheets: Array<{
      sheet: string; detectedKind: string; rowsScanned: number;
      rowsIgnoredAsBlank: number; headerAndSectionRows: number;
      masterRecords: number; continuationRows: number; successfullyMapped: number;
      warnings: number; errors: number; unresolvedRows: number; balanced: boolean;
    }>;
    totals: { rowsScanned: number; meaningfulRows: number; accountedFor: number; balanced: boolean };
  } | null;
  uploadedBy: { id: string; fullName: string; email: string } | null;
  sheets: SheetRow[];
  _count: { rows: number; issues: number };
}

interface ImportIssue {
  id: string;
  category: string;
  severity: string;
  field: string | null;
  rawValue: string | null;
  message: string;
  importRow: { rowNumber: number; kind: string; importSheet: { sheetName: string } } | null;
}

export default function ImportDetailPage() {
  const params = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [confirmApply, setConfirmApply] = useState(false);
  const [severity, setSeverity] = useState<string>('');

  const run = useQuery({
    queryKey: ['import', params.id],
    queryFn: () => api.get<ImportRunDetail>(`/imports/${params.id}`),
  });

  const issues = useQuery({
    queryKey: ['import', params.id, 'issues', severity],
    queryFn: () =>
      api.get<PaginatedResponse<ImportIssue>>(`/imports/${params.id}/issues`, {
        pageSize: 100,
        severity: severity || undefined,
      }),
  });

  const apply = useMutation({
    mutationFn: () =>
      api.post<{ recordsCreated: number; recordsMatched: number; issuesRaised: number }>(
        `/imports/${params.id}/apply`,
      ),
    onSuccess: (result) => {
      toast.success(`${t.imports.applied}: ${result.recordsCreated}`);
      setConfirmApply(false);
      void queryClient.invalidateQueries({ queryKey: ['import', params.id] });
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => {
      const code = (err as ApiError).code;
      toast.error((code && (t.errors as Record<string, string>)[code]) || t.errors.INTERNAL_ERROR);
    },
  });

  const data = run.data;
  if (run.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-72" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">{t.common.noResults}</p>;

  const balanced = data.reconciliation?.totals.balanced ?? data.rowsOrphan === 0;
  const canApply =
    can(PERMISSIONS.IMPORTS_APPLY) && (data.status === 'ANALYZED' || data.status === 'PREVIEWED');

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/imports" className="hover:text-foreground">
            {t.imports.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate">{data.sourceFilename}</span>
            <Badge variant={statusVariant(data.status)}>
              {t.status[data.status as keyof typeof t.status] ?? data.status}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3">
            <span>{formatDateTime(data.createdAt, locale)}</span>
            {data.uploadedBy ? <span>· {data.uploadedBy.fullName}</span> : null}
            <span className="font-mono text-2xs">· {data.checksum.slice(0, 16)}…</span>
          </span>
        }
        actions={
          canApply ? (
            <Button size="sm" onClick={() => setConfirmApply(true)}>
              <PlayCircle className="size-3.5" aria-hidden />
              {t.imports.apply}
            </Button>
          ) : null
        }
      />

      {data.failedReason ? (
        <div className="mb-4 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="font-mono">{data.failedReason}</span>
        </div>
      ) : null}

      {/* The acceptance guarantee, stated plainly at the top of the page. */}
      <div
        className={cn(
          'mb-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs',
          balanced ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
        )}
      >
        {balanced ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <span>
          <span className="font-medium">{balanced ? t.imports.balanced : t.imports.notBalanced}</span>
          {data.reconciliation ? (
            <span className="mt-0.5 block opacity-90">
              {t.imports.rowsScanned}: {data.reconciliation.totals.rowsScanned} ·{' '}
              {t.imports.masterRecords}: {data.rowsMaster} · {t.imports.continuationRows}:{' '}
              {data.rowsContinuation} · {t.imports.structuralRows}: {data.rowsStructural} ·{' '}
              {t.imports.rowsBlank}: {data.rowsBlank} · {t.imports.orphanRows}: {data.rowsOrphan}
            </span>
          ) : null}
        </span>
      </div>

      <Card className="mb-4">
        <CardHeader className="border-b">
          <CardTitle>{t.imports.reconciliation}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.imports.sheet}</th>
                  <th>{t.imports.detectedLayout}</th>
                  <th className="text-end">{t.imports.rowsScanned}</th>
                  <th className="text-end">{t.imports.rowsBlank}</th>
                  <th className="text-end">{t.imports.structuralRows}</th>
                  <th className="text-end">{t.imports.masterRecords}</th>
                  <th className="text-end">{t.imports.continuationRows}</th>
                  <th className="text-end">{t.imports.orphanRows}</th>
                  <th className="text-end">{t.imports.warnings}</th>
                  <th className="text-end">{t.imports.errors}</th>
                  <th>{t.imports.balanced}</th>
                </tr>
              </thead>
              <tbody>
                {(data.reconciliation?.sheets ?? []).map((sheet) => (
                  <tr key={sheet.sheet}>
                    <td className="font-medium">{sheet.sheet}</td>
                    <td>
                      {sheet.detectedKind === 'EMPTY' ? (
                        <span className="text-muted-foreground">{t.imports.emptySheet}</span>
                      ) : sheet.detectedKind === 'UNKNOWN' ? (
                        <Badge variant="warning">{t.imports.unmappedSheet}</Badge>
                      ) : (
                        <Badge variant="outline">{sheet.detectedKind}</Badge>
                      )}
                    </td>
                    <td className="text-end tabular-nums">{sheet.rowsScanned}</td>
                    <td className="text-end tabular-nums text-muted-foreground">{sheet.rowsIgnoredAsBlank}</td>
                    <td className="text-end tabular-nums text-muted-foreground">{sheet.headerAndSectionRows}</td>
                    <td className="text-end font-medium tabular-nums">{sheet.masterRecords}</td>
                    <td className="text-end tabular-nums">{sheet.continuationRows}</td>
                    <td className="text-end tabular-nums">
                      {sheet.unresolvedRows > 0 ? (
                        <span className="font-medium text-danger">{sheet.unresolvedRows}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-end tabular-nums">
                      {sheet.warnings > 0 ? <span className="text-warning">{sheet.warnings}</span> : '0'}
                    </td>
                    <td className="text-end tabular-nums">
                      {sheet.errors > 0 ? <span className="text-danger">{sheet.errors}</span> : '0'}
                    </td>
                    <td>
                      {sheet.balanced ? (
                        <CheckCircle2 className="size-4 text-success" aria-label={t.imports.balanced} />
                      ) : (
                        <TriangleAlert className="size-4 text-danger" aria-label={t.imports.notBalanced} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="border-b">
          <CardTitle>{t.imports.columnMapping}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          {data.sheets.map((sheet) => (
            <div key={sheet.id} className="rounded-md border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{sheet.sheetName}</span>
                {sheet.isEmpty ? (
                  <Badge variant="outline">{t.imports.emptySheet}</Badge>
                ) : (
                  <>
                    <Badge variant="outline">{sheet.detectedKind}</Badge>
                    {sheet.headerRow ? (
                      <span className="text-2xs text-muted-foreground">
                        {t.imports.headerRow}: {sheet.headerRow}
                      </span>
                    ) : null}
                  </>
                )}
              </div>

              {sheet.columnMapping && Object.keys(sheet.columnMapping).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(sheet.columnMapping).map(([column, field]) => (
                    <span key={column} className="rounded border bg-surface-muted px-1.5 py-0.5 text-2xs">
                      <span className="font-mono font-medium">{column}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span>{field}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              {sheet.unmappedColumns.length ? (
                <p className="mt-2 flex items-start gap-1.5 text-2xs text-warning">
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>
                    {t.imports.unmappedColumns}: {sheet.unmappedColumns.join(', ')} — preserved on the
                    imported rows and reported as issues.
                  </span>
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b">
          <CardTitle>
            {t.dataQuality.issues} ({data._count.issues})
          </CardTitle>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-7 rounded border border-input bg-surface px-1.5 text-xs"
            aria-label={t.dataQuality.severity}
          >
            <option value="">{t.common.all}</option>
            <option value="ERROR">{t.severity.ERROR}</option>
            <option value="WARNING">{t.severity.WARNING}</option>
            <option value="INFO">{t.severity.INFO}</option>
          </select>
        </CardHeader>
        <CardContent className="p-0">
          {issues.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-8 w-full" />
              ))}
            </div>
          ) : (issues.data?.data.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">{t.dataQuality.noIssues}</p>
          ) : (
            <ul className="divide-y">
              {issues.data!.data.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Badge variant={severityVariant(issue.severity)} className="mt-0.5 shrink-0">
                    {t.severity[issue.severity as keyof typeof t.severity] ?? issue.severity}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs">{issue.message}</span>
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      {t.issueCategory[issue.category as keyof typeof t.issueCategory] ?? issue.category}
                      {issue.importRow
                        ? ` · ${issue.importRow.importSheet.sheetName} ${t.dataQuality.sourceRow} ${issue.importRow.rowNumber}`
                        : ''}
                      {issue.field ? ` · ${issue.field}` : ''}
                    </span>
                  </span>
                  {issue.rawValue ? (
                    <code className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-2xs">
                      {issue.rawValue.slice(0, 40)}
                    </code>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmApply} onOpenChange={setConfirmApply}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.imports.apply}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">{t.imports.applyConfirm}</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>
                {t.imports.masterRecords}: <span className="font-medium tabular-nums">{data.rowsMaster}</span>
              </li>
              <li>
                {t.imports.continuationRows}:{' '}
                <span className="font-medium tabular-nums">{data.rowsContinuation}</span>
              </li>
              <li>
                {t.imports.warnings}: <span className="font-medium tabular-nums">{data.warningCount}</span> ·{' '}
                {t.imports.errors}: <span className="font-medium tabular-nums">{data.errorCount}</span>
              </li>
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApply(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => apply.mutate()} loading={apply.isPending}>
              {t.imports.apply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
