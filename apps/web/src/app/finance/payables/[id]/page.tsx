'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Plus, RotateCcw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Currency, PaymentMethod, PERMISSIONS } from '@elbakri/shared';
import { api, ApiError } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDate, formatDateTime, formatMoney, todayIso } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Payment {
  id: string;
  reference: string;
  amount: number | string;
  currency: string;
  paymentDate: string;
  method: string | null;
  paymentReference: string | null;
  status: string;
  notes: string | null;
  reversalReason: string | null;
  reversedAt: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
  reversedBy: { id: string; fullName: string } | null;
}

interface PayableDetail {
  id: string;
  reference: string;
  type: string;
  status: string;
  currency: string;
  totalAmount: number | string;
  paidAmount: number | string;
  outstanding: number | string;
  dueDate: string | null;
  serviceDate: string | null;
  serviceDescription: string | null;
  notes: string | null;
  version: number;
  legacyTotalRaw: string | null;
  legacyPaidRaw: string | null;
  legacyRestRaw: string | null;
  legacyPaymentDateRaw: string | null;
  legacyStatusRaw: string | null;
  legacySource: { workbook?: string; sheet?: string; row?: number } | null;
  legacyReconciliation: {
    legacyTotal: number | null;
    legacyPaid: number | null;
    legacyRest: number | null;
    canonicalOutstanding: number;
    difference: number | null;
    mismatch: boolean;
    restLooksLikeSum: boolean;
    reason: string | null;
  } | null;
  counterparty: { id: string; name: string; type: string } | null;
  tripFile: { id: string; reference: string } | null;
  payments: Payment[];
}

export default function PayableDetailPage() {
  const params = useParams<{ id: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [reversing, setReversing] = useState<Payment | null>(null);

  const query = useQuery({
    queryKey: ['financial-document', params.id],
    queryFn: () => api.get<PayableDetail>(`/financial-documents/${params.id}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['financial-document', params.id] });
    void queryClient.invalidateQueries({ queryKey: ['financial-documents'] });
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
  };

  const recordPayment = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/financial-documents/${params.id}/payments`, body),
    onSuccess: () => {
      toast.success(t.finance.recordPayment);
      setPayOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reverse = useMutation({
    mutationFn: (body: { id: string; reason: string }) =>
      api.post(`/payments/${body.id}/reverse`, { reason: body.reason }),
    onSuccess: () => {
      toast.success(t.finance.reversePayment);
      setReversing(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const doc = query.data;

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }
  if (!doc) return <p className="text-sm text-muted-foreground">{t.common.noResults}</p>;

  const outstanding = Number(doc.outstanding);
  const recon = doc.legacyReconciliation;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/finance/payables" className="hover:text-foreground">
            {t.finance.payables}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{doc.reference}</span>
            <Badge variant={statusVariant(doc.status)}>
              {t.status[doc.status as keyof typeof t.status] ?? doc.status}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3">
            <span>{doc.counterparty?.name ?? doc.serviceDescription ?? '—'}</span>
            {doc.tripFile ? (
              <Link href={`/trips/${doc.tripFile.id}`} className="text-primary hover:underline">
                {doc.tripFile.reference}
              </Link>
            ) : null}
          </span>
        }
        actions={
          can(PERMISSIONS.FINANCE_PAYMENTS_CREATE) && outstanding > 0 ? (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              {t.finance.recordPayment}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t.finance.paymentHistory}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {doc.payments.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  {t.common.noResults}
                </p>
              ) : (
                <ul className="divide-y">
                  {doc.payments.map((p) => {
                    const reversed = p.status === 'REVERSED';
                    const isReversal = p.status === 'REVERSAL';
                    return (
                      <li key={p.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm">
                              <span
                                className={`font-medium tabular-nums ${
                                  reversed ? 'text-muted-foreground line-through' : isReversal ? 'text-danger' : ''
                                }`}
                              >
                                {formatMoney(p.amount, p.currency, locale)}
                              </span>
                              <Badge variant={statusVariant(p.status)}>
                                {t.status[p.status as keyof typeof t.status] ?? p.status}
                              </Badge>
                            </p>
                            <p className="mt-0.5 text-2xs text-muted-foreground">
                              {formatDate(p.paymentDate, locale)}
                              {p.method ? ` · ${p.method}` : ''}
                              {p.paymentReference ? ` · ${p.paymentReference}` : ''}
                              {p.createdBy ? ` · ${p.createdBy.fullName}` : ''}
                            </p>
                            {p.notes ? (
                              <p className="mt-1 text-2xs text-muted-foreground">{p.notes}</p>
                            ) : null}
                            {p.reversalReason ? (
                              <p className="mt-1 text-2xs text-danger">
                                {t.finance.reversalReason}: {p.reversalReason}
                                {p.reversedBy ? ` — ${p.reversedBy.fullName}` : ''}
                                {p.reversedAt ? ` · ${formatDateTime(p.reversedAt, locale)}` : ''}
                              </p>
                            ) : null}
                          </div>

                          {can(PERMISSIONS.FINANCE_PAYMENTS_REVERSE) && p.status === 'POSTED' ? (
                            <Button variant="ghost" size="sm" onClick={() => setReversing(p)}>
                              <RotateCcw className="size-3.5" aria-hidden />
                              {t.finance.reversePayment}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {recon && recon.mismatch ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5 text-warning" aria-hidden />
                  {t.finance.reconciliation}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <p className="mb-3 text-2xs text-muted-foreground">{t.finance.reconciliationHint}</p>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.finance.legacyTotal}</th>
                        <th>{t.finance.legacyPaid}</th>
                        <th>{t.finance.legacyRest}</th>
                        <th>{t.finance.calculatedOutstanding}</th>
                        <th>{t.finance.difference}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="tabular-nums">{doc.legacyTotalRaw ?? recon.legacyTotal ?? '—'}</td>
                        <td className="tabular-nums">{doc.legacyPaidRaw ?? recon.legacyPaid ?? '—'}</td>
                        <td className="tabular-nums">{doc.legacyRestRaw ?? recon.legacyRest ?? '—'}</td>
                        <td className="font-medium tabular-nums">
                          {formatMoney(recon.canonicalOutstanding, doc.currency, locale)}
                        </td>
                        <td className="font-medium tabular-nums text-warning">
                          {recon.difference === null
                            ? '—'
                            : formatMoney(recon.difference, doc.currency, locale)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {recon.restLooksLikeSum ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-md bg-warning-subtle px-3 py-2 text-2xs text-warning">
                    <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {t.finance.restLooksLikeSum}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t.finance.payable}</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <dl className="space-y-2.5 text-xs">
                <Row label={t.finance.totalAmount}>
                  <span className="tabular-nums">{formatMoney(doc.totalAmount, doc.currency, locale)}</span>
                </Row>
                <Row label={t.finance.paidAmount}>
                  <span className="tabular-nums text-success">
                    {formatMoney(doc.paidAmount, doc.currency, locale)}
                  </span>
                </Row>
                <Row label={t.finance.outstanding}>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(doc.outstanding, doc.currency, locale)}
                  </span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">
                    {t.finance.outstandingDerived}
                  </span>
                </Row>
                <Row label={t.finance.dueDate}>
                  <span className="tabular-nums">{formatDate(doc.dueDate, locale)}</span>
                </Row>
                <Row label={t.finance.serviceDate}>
                  <span className="tabular-nums">{formatDate(doc.serviceDate, locale)}</span>
                </Row>
                {doc.notes ? <Row label={t.common.notes}>{doc.notes}</Row> : null}
                {doc.legacyStatusRaw ? (
                  <Row label={t.common.source}>
                    <span className="font-mono text-2xs">{doc.legacyStatusRaw}</span>
                  </Row>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {doc.legacySource?.workbook ? (
            <Card>
              <CardContent className="pt-3">
                <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>
                    {t.common.source}: {doc.legacySource.workbook} · {doc.legacySource.sheet} ·{' '}
                    {t.dataQuality.sourceRow} {doc.legacySource.row}
                  </span>
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Record payment — there is deliberately no field for the balance. */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.finance.recordPayment}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              recordPayment.mutate({
                amount: Number(form.get('amount')),
                currency: String(form.get('currency')),
                paymentDate: String(form.get('paymentDate')),
                method: String(form.get('method')) || undefined,
                paymentReference: String(form.get('paymentReference')) || undefined,
                notes: String(form.get('notes')) || undefined,
              });
            }}
          >
            <DialogBody className="space-y-4">
              <p className="rounded-md bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
                {t.finance.outstanding}:{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(doc.outstanding, doc.currency, locale)}
                </span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amount" required>{t.finance.amount}</Label>
                  <Input
                    id="amount" name="amount" type="number" step="0.01" min="0.01"
                    max={outstanding > 0 ? outstanding : undefined}
                    defaultValue={outstanding > 0 ? outstanding : ''}
                    required dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency" required>{t.finance.currency}</Label>
                  <select id="currency" name="currency" defaultValue={doc.currency}
                    className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                    {Object.values(Currency).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentDate" required>{t.finance.paymentDate}</Label>
                <Input id="paymentDate" name="paymentDate" type="date" defaultValue={todayIso()} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="method">{t.finance.paymentMethod}</Label>
                <select id="method" name="method" defaultValue={PaymentMethod.BANK_TRANSFER}
                  className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                  {Object.values(PaymentMethod).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentReference">{t.finance.paymentReference}</Label>
                <Input id="paymentReference" name="paymentReference" dir="ltr" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">{t.common.notes}</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" loading={recordPayment.isPending}>{t.common.save}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reversal posts a new entry; the original is kept and marked. */}
      <Dialog open={Boolean(reversing)} onOpenChange={(open) => !open && setReversing(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.finance.reversePayment}</DialogTitle>
          </DialogHeader>
          {reversing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                reverse.mutate({ id: reversing.id, reason: String(form.get('reason')) });
              }}
            >
              <DialogBody className="space-y-4">
                <p className="text-xs">
                  {formatMoney(reversing.amount, reversing.currency, locale)} ·{' '}
                  {formatDate(reversing.paymentDate, locale)}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reason" required>{t.finance.reversalReason}</Label>
                  <Textarea id="reason" name="reason" rows={3} required minLength={3} />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReversing(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" variant="destructive" loading={reverse.isPending}>
                  {t.finance.reversePayment}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
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
