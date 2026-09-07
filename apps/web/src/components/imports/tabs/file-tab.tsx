'use client';

import { FileSpreadsheet } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ImportTabContext } from '../types';

/** What the workbook contains and how each sheet was read. */
export function ImportFileTab({ context }: { context: ImportTabContext }) {
  const { run } = context;
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      {run.sheets.map((sheet) => (
        <Card key={sheet.id}>
          <CardContent className="pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{sheet.sheetName}</span>
              {sheet.isEmpty ? (
                <Badge variant="outline">{t.imports.emptySheet}</Badge>
              ) : sheet.detectedKind === 'UNKNOWN' ? (
                <Badge variant="warning">{t.imports.unmappedSheet}</Badge>
              ) : (
                <Badge variant="outline">{sheet.detectedKind}</Badge>
              )}
            </div>

            {sheet.isEmpty ? (
              <p className="text-xs text-muted-foreground">{t.imports.emptySheet}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat label={t.imports.headerRow} value={sheet.headerRow ?? '—'} />
                <Stat label={t.imports.rowsScanned} value={sheet.rowsScanned} />
                <Stat label={t.imports.masterRecords} value={sheet.stats?.masterRecords ?? 0} />
                <Stat
                  label={t.imports.continuationRows}
                  value={sheet.stats?.continuationRows ?? 0}
                />
              </dl>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
