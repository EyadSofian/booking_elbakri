'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpNotice } from '@/components/help/help-tip';
import type { ImportTabContext } from '../types';

/** As returned by `GET /imports/:id/preview` — import rows with their issues. */
interface PreviewRow {
  id: string;
  rowNumber: number;
  kind: string;
  sectionLabel: string | null;
  rawValues: Record<string, unknown> | null;
  importSheet: { sheetName: string; detectedKind: string | null };
  issues: Array<{ category: string; severity: string; message: string; field: string | null }>;
}

/** What Apply will actually create, before anything is written. */
export function ImportPreviewTab({ context }: { context: ImportTabContext }) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['import', context.runId, 'preview'],
    queryFn: () =>
      api.get<PreviewRow[]>(`/imports/${context.runId}/preview`, { limit: 100 }),
  });

  const rows = query.data ?? [];

  return (
    <>
      <HelpNotice noticeKey="notice.importReconciliation" />

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-8 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Eye} title={t.common.noResults} description={t.imports.previewHint} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.imports.sheet}</th>
                    <th>{t.dataQuality.sourceRow}</th>
                    <th>{t.common.name}</th>
                    <th>{t.common.date}</th>
                    <th>{t.dataQuality.issues}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{row.importSheet.sheetName}</td>
                      <td className="tabular-nums">
                        {row.rowNumber}
                        <Badge variant="outline" className="ms-1.5">{row.kind}</Badge>
                      </td>
                      <td className="max-w-56 truncate">
                        {String(row.rawValues?.name ?? row.rawValues?.hotelName ?? '—')}
                      </td>
                      <td className="max-w-40 truncate tabular-nums">
                        {String(row.rawValues?.date ?? row.rawValues?.checkIn ?? '—')}
                      </td>
                      <td>
                        {row.issues.length ? (
                          <Badge variant="warning">{row.issues.length}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <p className="mt-2 text-center text-2xs text-muted-foreground">
          {rows.length} {t.imports.previewSample}
        </p>
      ) : null}
    </>
  );
}
