'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpNotice } from '@/components/help/help-tip';
import type { ImportTabContext } from '../types';

/** Proof that every scanned row is accounted for. */
export function ImportReconciliationTab({ context }: { context: ImportTabContext }) {
  const { run } = context;
  const { t } = useI18n();

  if (!run.reconciliation) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState title={t.imports.reconciliation} description={t.imports.notAnalysedYet} />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <HelpNotice noticeKey="notice.importReconciliation" />

      <Card>
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
                {run.reconciliation.sheets.map((sheet) => (
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
                    <td className="text-end tabular-nums text-muted-foreground">
                      {sheet.rowsIgnoredAsBlank}
                    </td>
                    <td className="text-end tabular-nums text-muted-foreground">
                      {sheet.headerAndSectionRows}
                    </td>
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
                      {sheet.warnings > 0 ? (
                        <span className="text-warning">{sheet.warnings}</span>
                      ) : '0'}
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
    </>
  );
}
