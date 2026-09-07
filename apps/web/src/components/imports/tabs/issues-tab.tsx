'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, severityVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import type { ImportIssueRow, ImportTabContext } from '../types';

export function ImportIssuesTab({ context }: { context: ImportTabContext }) {
  const { t } = useI18n();
  const [severity, setSeverity] = useState('');

  const query = useQuery({
    queryKey: ['import', context.runId, 'issues', severity],
    queryFn: () =>
      api.get<PaginatedResponse<ImportIssueRow>>(`/imports/${context.runId}/issues`, {
        pageSize: 200,
        severity: severity || undefined,
      }),
  });

  const rows = query.data?.data ?? [];

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
          aria-label={t.dataQuality.severity}
        >
          <option value="">{t.common.all}</option>
          <option value="ERROR">{t.severity.ERROR}</option>
          <option value="WARNING">{t.severity.WARNING}</option>
          <option value="INFO">{t.severity.INFO}</option>
        </select>
        <span className="ms-auto text-2xs text-muted-foreground">
          {rows.length} / {context.run._count.issues}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={t.dataQuality.noIssues}
              description={t.imports.noIssuesHint}
            />
          ) : (
            <ul className="divide-y">
              {rows.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Badge variant={severityVariant(issue.severity)} className="mt-0.5 shrink-0">
                    {t.severity[issue.severity as keyof typeof t.severity] ?? issue.severity}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs">{issue.message}</span>
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      {t.issueCategory[issue.category as keyof typeof t.issueCategory] ??
                        issue.category}
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
    </>
  );
}
