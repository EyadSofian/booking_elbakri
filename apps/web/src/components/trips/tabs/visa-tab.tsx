'use client';

import { Globe2 } from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import { useI18n, useSession } from '@/lib/providers';
import { formatDate, formatMoney } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpTip } from '@/components/help/help-tip';
import type { TripTabContext } from '../types';

export function VisaTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();
  const { can } = useSession();

  // The API omits the amounts entirely without this permission; the check here
  // only decides whether to render the columns.
  const showAmounts = can(PERMISSIONS.VISAS_FINANCE_READ);

  if (trip.visaOrders.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState icon={Globe2} title={t.trips.noVisas} description={t.trips.noVisasHint} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.common.reference}</th>
                <th>{t.visas.origin}</th>
                <th>{t.visas.destination}</th>
                <th>{t.trips.pax}</th>
                <th>{t.common.date}</th>
                {showAmounts ? (
                  <>
                    <th>{t.visas.net}</th>
                    <th>{t.visas.sell}</th>
                    <th>
                      <span className="inline-flex items-center gap-1">
                        {t.visas.margin}
                        <HelpTip helpKey="field.visaMargin" label={t.visas.margin} />
                      </span>
                    </th>
                  </>
                ) : null}
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {trip.visaOrders.map((order) => (
                <tr key={order.id}>
                  <td className="tabular-nums">{order.reference}</td>
                  <td>{order.originRaw ?? '—'}</td>
                  <td>{order.destinationRaw ?? '—'}</td>
                  <td className="tabular-nums">{order.paxCount ?? '—'}</td>
                  <td className="tabular-nums">{formatDate(order.serviceDate, locale)}</td>
                  {showAmounts ? (
                    <>
                      <td className="tabular-nums">
                        {formatMoney(order.netAmount as number, order.currency, locale)}
                      </td>
                      <td className="tabular-nums">
                        {formatMoney(order.sellAmount as number, order.currency, locale)}
                      </td>
                      {/* The server's derived value — never recomputed here. */}
                      <td className="tabular-nums font-medium">
                        {order.margin === null || order.margin === undefined
                          ? '—'
                          : formatMoney(order.margin as number, order.currency, locale)}
                      </td>
                    </>
                  ) : null}
                  <td>
                    <Badge variant={statusVariant(order.status)}>
                      {t.status[order.status as keyof typeof t.status] ?? order.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAmounts ? (
          <p className="border-t px-4 py-2 text-2xs text-muted-foreground">
            {t.visas.financeHidden}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
