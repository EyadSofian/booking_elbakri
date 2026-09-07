'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { cn, formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { StatCard } from '@/components/data/stat-card';
import type { ImportTabContext } from '../types';

export function ImportOverviewTab({ context }: { context: ImportTabContext }) {
  const { run } = context;
  const { t, locale } = useI18n();
  const balanced = run.reconciliation?.totals.balanced ?? run.rowsOrphan === 0;

  return (
    <>
      {/* The acceptance guarantee, stated before anything else. */}
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
          <span className="font-medium">
            {balanced ? t.imports.balanced : t.imports.notBalanced}
          </span>
          {run.reconciliation ? (
            <span className="mt-0.5 block opacity-90">
              {t.imports.rowsScanned}: {run.reconciliation.totals.rowsScanned} ·{' '}
              {t.imports.masterRecords}: {run.rowsMaster} · {t.imports.continuationRows}:{' '}
              {run.rowsContinuation} · {t.imports.orphanRows}: {run.rowsOrphan}
            </span>
          ) : null}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatCard label={t.imports.rowsScanned} value={run.rowsScanned} />
        <StatCard label={t.imports.masterRecords} value={run.rowsMaster} />
        <StatCard label={t.imports.continuationRows} value={run.rowsContinuation} />
        <StatCard
          label={t.imports.warnings}
          value={run.warningCount}
          tone={run.warningCount > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={t.imports.errors}
          value={run.errorCount}
          tone={run.errorCount > 0 ? 'danger' : 'default'}
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t.imports.sourceFile}</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <Row label={t.imports.sourceFile}>{run.sourceFilename}</Row>
            <Row label={t.common.status}>
              <Badge variant={statusVariant(run.status)}>
                {t.status[run.status as keyof typeof t.status] ?? run.status}
              </Badge>
            </Row>
            <Row label={t.imports.uploadedBy}>{run.uploadedBy?.fullName ?? '—'}</Row>
            <Row label={t.common.date}>{formatDateTime(run.createdAt, locale)}</Row>
            <Row label={t.imports.checksum}>
              <span className="break-all font-mono text-2xs">{run.checksum}</span>
            </Row>
            <Row label={t.imports.sheets}>{run.sheets.length}</Row>
            {run.appliedAt ? (
              <>
                <Row label={t.imports.recordsCreated}>{run.recordsCreated}</Row>
                <Row label={t.imports.recordsMatched}>{run.recordsMatched}</Row>
              </>
            ) : null}
          </dl>

          {run.failedReason ? (
            <p className="mt-3 rounded-md bg-danger-subtle px-3 py-2 font-mono text-2xs text-danger">
              {run.failedReason}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
