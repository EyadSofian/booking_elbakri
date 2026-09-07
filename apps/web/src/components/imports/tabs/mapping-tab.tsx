'use client';

import { Info } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import type { ImportTabContext } from '../types';

/** Which source column became which system field. */
export function ImportMappingTab({ context }: { context: ImportTabContext }) {
  const { run } = context;
  const { t } = useI18n();

  const mapped = run.sheets.filter((s) => !s.isEmpty);
  if (mapped.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState title={t.imports.emptySheet} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {mapped.map((sheet) => (
        <Card key={sheet.id}>
          <CardContent className="pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{sheet.sheetName}</span>
              <Badge variant="outline">{sheet.detectedKind}</Badge>
            </div>

            {sheet.columnMapping && Object.keys(sheet.columnMapping).length ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(sheet.columnMapping).map(([column, field]) => (
                  <span
                    key={column}
                    className="rounded border bg-surface-muted px-1.5 py-0.5 text-2xs"
                  >
                    <span className="font-mono font-medium">{column}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span>{field}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t.imports.unmappedSheet}</p>
            )}

            {sheet.unmappedColumns.length ? (
              // An unmapped column is preserved on the row, not dropped.
              <p className="mt-2 flex items-start gap-1.5 text-2xs text-warning">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>
                  {t.imports.unmappedColumns}: {sheet.unmappedColumns.join(', ')} —{' '}
                  {t.imports.unmappedPreserved}
                </span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
