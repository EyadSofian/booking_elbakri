'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PAYMENT_METHODS, roomsText, type SaleDetail, type SalePaymentMethod, type Status } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useActivity, useInvalidate, useRecord } from '@/lib/queries';
import { cn, formatNumber, todayIso } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusMenu } from '@/components/shared/status';
import { DateText, Money, RefTag } from '@/components/shared/format';
import { ActivityList } from '@/components/shared/activity-list';
import { ConfirmDialog, ErrorState, RowsSkeleton } from '@/components/shared/feedback';
import { Field } from '@/components/shared/field';
import { MoneyInput } from '@/components/ops/form-parts';
import { num } from '@/components/ops/draft';
import { LINE_ICON, lineLabel } from '@/components/sales/sale-form';

export default function SalePage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale, dir, errorMessage } = useI18n();
  const { is } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const sale = useRecord<SaleDetail>('/sales', id);
  const history = useActivity('/sales', id);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [removePayment, setRemovePayment] = React.useState<string | null>(null);
  const canEdit = is('SALES');

  const refresh = () => {
    invalidate('/sales');
    void qc.invalidateQueries({ queryKey: ['/sales', 'activity', id] });
  };

  const status = useMutation({
    mutationFn: (s: Status) => api.patch(`/sales/${id}/status`, { status: s }),
    onSuccess: () => {
      toast.success(t.common.statusChanged);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/sales/${id}`),
    onSuccess: () => {
      toast.success(t.common.deleted);
      invalidate('/sales');
      router.push('/sales');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const deletePayment = useMutation({
    mutationFn: (paymentId: string) => api.delete(`/sales/${id}/payments/${paymentId}`),
    onSuccess: () => {
      setRemovePayment(null);
      toast.success(t.common.deleted);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (sale.isLoading) return <RowsSkeleton rows={10} cols={4} />;
  if (sale.isError || !sale.data) return <ErrorState error={sale.error} onRetry={() => sale.refetch()} />;
  const s = sale.data;
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const paidShare = s.customerTotal > 0 ? Math.min(100, Math.round((s.paid / s.customerTotal) * 100)) : 0;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 animate-rise">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" asChild aria-label={t.common.back}>
            <Link href="/sales">
              <BackIcon />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <RefTag value={s.ref} />
              <span className="text-xs text-muted-foreground">
                {t.sales.saleDate}: <DateText value={s.saleDate} />
              </span>
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{s.customerName}</h1>
            <p className="bidi text-sm text-muted-foreground">
              {[s.destination, s.hotelName].filter(Boolean).join(' · ') || '—'}
              {s.startDate ? (
                <>
                  {' · '}
                  <DateText value={s.startDate} /> {t.common.arrow} <DateText value={s.endDate} />
                  {s.nights != null ? ` · ${t.common.night(s.nights)}` : ''}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusMenu status={s.status} onChange={(st) => status.mutate(st)} disabled={!canEdit} size="md" />
          {canEdit ? (
            <>
              <Button asChild>
                <Link href={`/sales/${s.id}/edit`}>
                  <Pencil />
                  {t.common.edit}
                </Link>
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t.common.more}>
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem destructive onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    {t.common.delete}
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          ) : null}
        </div>
      </div>

      {/* The money at a glance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-rise [animation-delay:50ms]">
        {[
          { label: t.sales.totalSell, value: s.totalSell, cls: '' },
          { label: t.sales.totalProfit, value: s.totalProfit, cls: s.totalProfit < 0 ? 'text-danger' : 'text-success', note: `${t.sales.sellerCommission}: ${formatNumber(s.commission, locale)}` },
          { label: t.sales.paid, value: s.paid, cls: 'text-success' },
          { label: t.sales.remaining, value: s.remaining, cls: s.remaining > 0 ? 'text-sun-foreground dark:text-sun' : 'text-success' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card px-4 py-3 shadow-xs">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <Money value={k.value} currency={s.currency} className={cn('mt-1 block text-xl font-semibold', k.cls)} />
            {k.note ? <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{k.note}</p> : null}
            {k.label === t.sales.remaining ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${paidShare}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="animate-rise [animation-delay:90ms]">
            <CardHeader>
              <CardTitle>{t.sales.customerSection}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  [t.sales.phone, s.phone ? <a key="p" href={`tel:${s.phone}`} className="ltr text-primary hover:underline">{s.phone}</a> : '—'],
                  [t.common.nationality, s.nationality ?? '—'],
                  [t.sales.destination, s.destination ?? '—'],
                  [t.sales.start, <DateText key="a" value={s.startDate} full />],
                  [t.sales.end, <DateText key="b" value={s.endDate} full />],
                  [t.common.pax, `${s.adults} ${t.sales.adults}${s.children ? ` + ${s.children} ${t.sales.children}` : ''}`],
                  [t.sales.seller, s.seller?.name ?? '—'],
                ].map(([label, value]) => (
                  <div key={label as string} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 break-words font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {s.notes ? <p className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm">{s.notes}</p> : null}
            </CardContent>
          </Card>

          <Card className="animate-rise [animation-delay:120ms]">
            <CardHeader>
              <CardTitle>{t.sales.itemsSection}</CardTitle>
              <span className="text-xs text-muted-foreground">{t.currencies[s.currency]}</span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 text-start font-semibold">{t.sales.service}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t.common.cost}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t.common.sell}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t.sales.commission}</th>
                    <th className="px-4 py-2 text-end font-semibold">{t.common.profit}</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-t">
                  {s.lines.map((l) => {
                    const Icon = LINE_ICON[l.kind];
                    const rooms = l.kind === 'HOTEL' ? roomsText(l.singleRooms, l.doubleRooms, l.tripleRooms) : '';
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 font-medium">
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="bidi truncate">{l.title || lineLabel(t, l.kind)}</span>
                          </div>
                          <div className="ms-6 truncate text-xs text-muted-foreground">
                            {l.title ? `${lineLabel(t, l.kind)} · ` : ''}
                            <DateText value={l.startDate} />
                            {l.endDate ? <> {t.common.arrow} <DateText value={l.endDate} /></> : null}
                            {l.nights != null ? ` · ${t.common.night(l.nights)}` : ''}
                            {rooms ? ` · ${rooms}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular">{formatNumber(l.cost, locale)}</td>
                        <td className="px-3 py-2.5 text-end tabular">{formatNumber(l.sell, locale)}</td>
                        <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{l.kind === 'FLIGHT' && l.commission ? formatNumber(l.commission, locale) : '—'}</td>
                        <td className={cn('px-4 py-2.5 text-end tabular font-medium', l.profit < 0 ? 'text-danger' : 'text-success')}>{formatNumber(l.profit, locale)}</td>
                      </tr>
                    );
                  })}
                  {!s.lines.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">—</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t bg-surface-muted font-semibold">
                  <tr>
                    <td className="px-4 py-2.5">{t.sales.totalsSection}</td>
                    <td className="px-3 py-2.5 text-end tabular">{formatNumber(s.totalCost, locale)}</td>
                    <td className="px-3 py-2.5 text-end tabular">{formatNumber(s.totalSell, locale)}</td>
                    <td className="px-3 py-2.5 text-end tabular text-muted-foreground">
                      {formatNumber(s.commission, locale)}
                      <span className="block text-[0.65rem] font-normal">{t.sales.sellerCommission} {formatNumber(s.commissionRate, locale)}%</span>
                    </td>
                    <td className={cn('px-4 py-2.5 text-end tabular', s.totalProfit < 0 ? 'text-danger' : 'text-success')}>{formatNumber(s.totalProfit, locale)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="animate-rise [animation-delay:150ms]">
            <CardHeader>
              <CardTitle>{t.common.history}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityList items={history.data} type="SALE" loading={history.isLoading} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <PaymentsCard sale={s} canEdit={canEdit} onChanged={refresh} onRemove={setRemovePayment} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.common.deleteTitle}
        body={t.common.deleteBody}
        confirmLabel={t.common.delete}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={Boolean(removePayment)}
        onOpenChange={(o) => !o && setRemovePayment(null)}
        title={t.sales.removePaymentTitle}
        confirmLabel={t.sales.removePayment}
        busy={deletePayment.isPending}
        onConfirm={() => removePayment && deletePayment.mutate(removePayment)}
      />
    </div>
  );
}

function PaymentsCard({
  sale,
  canEdit,
  onChanged,
  onRemove,
}: {
  sale: SaleDetail;
  canEdit: boolean;
  onChanged: () => void;
  onRemove: (id: string) => void;
}) {
  const { t, errorMessage } = useI18n();
  const [adding, setAdding] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [paidOn, setPaidOn] = React.useState(todayIso());
  const [method, setMethod] = React.useState<SalePaymentMethod>('CASH');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');

  const add = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/payments`, { amount: num(amount), paidOn, method, note: note.trim() || null }),
    onSuccess: () => {
      toast.success(t.common.saved);
      setAdding(false);
      setAmount('');
      setNote('');
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card className="animate-rise [animation-delay:110ms]">
      <CardHeader>
        <CardTitle>{t.sales.paymentsSection}</CardTitle>
        {canEdit && !adding ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding(true);
              if (sale.remaining > 0) setAmount(String(sale.remaining));
            }}
          >
            <Plus />
            {t.sales.addPayment}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding ? (
          <form
            className="space-y-3 rounded-lg border border-dashed bg-surface-muted p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!num(amount)) {
                setError(t.common.required);
                return;
              }
              add.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.sales.paymentAmount} htmlFor="p-amount" required error={error}>
                <MoneyInput id="p-amount" value={amount} onChange={(v) => { setAmount(v); setError(''); }} invalid={Boolean(error)} />
              </Field>
              <Field label={t.sales.paidOn} htmlFor="p-date">
                <Input id="p-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label={t.sales.method} htmlFor="p-method">
                <NativeSelect id="p-method" value={method} onChange={(e) => setMethod(e.target.value as SalePaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t.paymentMethod[m]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.sales.paymentNote} htmlFor="p-note">
                <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" loading={add.isPending}>
                {t.sales.addPayment}
              </Button>
            </div>
          </form>
        ) : null}

        {sale.payments.length ? (
          <ul className="divide-y rounded-lg border">
            {sale.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Money value={p.amount} currency={sale.currency} className="font-semibold" />
                  <p className="truncate text-xs text-muted-foreground">
                    <DateText value={p.paidOn} /> · {p.method ? t.paymentMethod[p.method] : '—'}
                    {p.note ? ` · ${p.note}` : ''}
                    {p.createdBy ? ` · ${p.createdBy.name}` : ''}
                  </p>
                </div>
                {canEdit ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => onRemove(p.id)} aria-label={t.sales.removePayment}>
                    <X />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !adding ? (
          <p className="text-sm text-muted-foreground">{t.sales.paymentsEmpty}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
