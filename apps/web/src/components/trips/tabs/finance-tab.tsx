'use client';

import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDate, formatMoney } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpNotice, HelpTip } from '@/components/help/help-tip';
import type { TripTabContext } from '../types';

export function FinanceTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();

  if (trip.financialDocuments.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState icon={Receipt} title={t.trips.noFinance} description={t.trips.noFinanceHint} />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <HelpNotice noticeKey="notice.outstandingDerived" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.common.reference}</th>
                  <th>{t.finance.counterparty}</th>
                  <th>{t.finance.totalAmount}</th>
                  <th>{t.finance.paidAmount}</th>
                  <th>
                    <span className="inline-flex items-center gap-1">
                      {t.finance.outstanding}
                      <HelpTip helpKey="field.outstanding" label={t.finance.outstanding} />
                    </span>
                  </th>
                  <th>{t.finance.dueDate}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {trip.financialDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td className="tabular-nums">
                      <Link
                        href={`/finance/payables/${doc.id}`}
                        className="text-primary hover:underline"
                      >
                        {doc.reference}
                      </Link>
                    </td>
                    <td>{doc.counterparty?.name ?? doc.serviceDescription ?? '—'}</td>
                    <td className="tabular-nums">
                      {formatMoney(doc.totalAmount, doc.currency, locale)}
                    </td>
                    {/*
                      paidAmount and outstanding are derived by the server from
                      the payment ledger. The UI renders them; it never adds up
                      transactions itself, which is how the two would drift.
                    */}
                    <td className="tabular-nums text-success">
                      {formatMoney(doc.paidAmount ?? 0, doc.currency, locale)}
                    </td>
                    <td className="font-medium tabular-nums">
                      {formatMoney(doc.outstanding ?? 0, doc.currency, locale)}
                    </td>
                    <td className="tabular-nums">{formatDate(doc.dueDate, locale)}</td>
                    <td>
                      <Badge variant={statusVariant(doc.status)}>
                        {t.status[doc.status as keyof typeof t.status] ?? doc.status}
                      </Badge>
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
