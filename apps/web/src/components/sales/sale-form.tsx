'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, BedDouble, CarFront, Plane, Sparkles } from 'lucide-react';
import {
  PAYMENT_METHODS, computeSaleTotals, countNights, type CurrencyCode, type SaleDetail, type SalePaymentMethod,
} from '@elbakri/shared';
import { ApiError, api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useHotels, useInvalidate } from '@/lib/queries';
import { cn, formatNumber, todayIso } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field, FormSection } from '@/components/shared/field';
import { StatusPicker } from '@/components/shared/status';
import { CurrencySelect, SellerSelect, SuggestInput } from '@/components/shared/pickers';
import { ConfirmDialog } from '@/components/shared/feedback';
import { MoneyInput } from '@/components/ops/form-parts';
import { asCurrency, asStatus, int, num, str, toStr, useDraft, type Draft } from '@/components/ops/draft';

function emptySale(sellerId: string): Draft {
  return {
    status: 'NEW', saleDate: todayIso(), customerName: '', nationality: '', phone: '', destination: '', hotelName: '',
    adults: '2', children: '0', singleRooms: '0', doubleRooms: '1', tripleRooms: '0', startDate: '', endDate: '',
    currency: 'EGP', hotelCost: '', hotelSell: '', flightDetails: '', flightCost: '', flightSell: '', flightCommission: '',
    transferDetails: '', transferCost: '', transferSell: '', serviceType: '', serviceCost: '', serviceSell: '',
    sellerId, commissionRate: '10', notes: '',
    payAmount: '', payDate: todayIso(), payMethod: 'CASH', reqHotel: 'yes', reqTransfer: '',
  };
}

function saleToDraft(s: SaleDetail): Draft {
  const n = (v: number) => (v ? String(v) : '');
  return {
    status: s.status, saleDate: s.saleDate, customerName: s.customerName, nationality: toStr(s.nationality), phone: toStr(s.phone),
    destination: toStr(s.destination), hotelName: toStr(s.hotelName), adults: String(s.adults), children: String(s.children),
    singleRooms: String(s.singleRooms), doubleRooms: String(s.doubleRooms), tripleRooms: String(s.tripleRooms),
    startDate: toStr(s.startDate), endDate: toStr(s.endDate), currency: s.currency,
    hotelCost: n(s.hotelCost), hotelSell: n(s.hotelSell), flightDetails: toStr(s.flightDetails), flightCost: n(s.flightCost),
    flightSell: n(s.flightSell), flightCommission: n(s.flightCommission), transferDetails: toStr(s.transferDetails),
    transferCost: n(s.transferCost), transferSell: n(s.transferSell), serviceType: toStr(s.serviceType),
    serviceCost: n(s.serviceCost), serviceSell: n(s.serviceSell), sellerId: s.seller?.id ?? '', commissionRate: String(s.commissionRate),
    notes: toStr(s.notes), payAmount: '', payDate: todayIso(), payMethod: 'CASH', reqHotel: '', reqTransfer: '',
  };
}

function payload(d: Draft, isNew: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    status: d.status,
    saleDate: d.saleDate || undefined,
    customerName: d.customerName.trim(),
    nationality: str(d.nationality),
    phone: str(d.phone),
    destination: str(d.destination),
    hotelName: str(d.hotelName),
    adults: int(d.adults) ?? 0,
    children: int(d.children) ?? 0,
    singleRooms: int(d.singleRooms) ?? 0,
    doubleRooms: int(d.doubleRooms) ?? 0,
    tripleRooms: int(d.tripleRooms) ?? 0,
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    currency: d.currency,
    hotelCost: num(d.hotelCost) ?? 0,
    hotelSell: num(d.hotelSell) ?? 0,
    flightDetails: str(d.flightDetails),
    flightCost: num(d.flightCost) ?? 0,
    flightSell: num(d.flightSell) ?? 0,
    flightCommission: num(d.flightCommission) ?? 0,
    transferDetails: str(d.transferDetails),
    transferCost: num(d.transferCost) ?? 0,
    transferSell: num(d.transferSell) ?? 0,
    serviceType: str(d.serviceType),
    serviceCost: num(d.serviceCost) ?? 0,
    serviceSell: num(d.serviceSell) ?? 0,
    sellerId: d.sellerId || null,
    commissionRate: num(d.commissionRate) ?? 10,
    notes: str(d.notes),
  };
  if (isNew) {
    const amount = num(d.payAmount);
    if (amount && amount > 0) body.initialPayment = { amount, paidOn: d.payDate || todayIso(), method: d.payMethod || null };
    if (d.reqHotel || d.reqTransfer) body.requests = { hotel: Boolean(d.reqHotel), transfer: Boolean(d.reqTransfer) };
  }
  return body;
}

/** Counter input for people and rooms: − value + */
function Count({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const n = Number(value || 0);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8rem] font-medium text-foreground/85">
        {label}
      </label>
      <div className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-surface shadow-xs focus-within:ring-2 focus-within:ring-ring/25">
        <button type="button" className="h-full px-2.5 text-muted-foreground hover:bg-accent" onClick={() => onChange(String(Math.max(0, n - 1)))} aria-label="−">
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
          className="tabular h-full w-full min-w-0 bg-transparent text-center text-sm outline-none"
        />
        <button type="button" className="h-full px-2.5 text-muted-foreground hover:bg-accent" onClick={() => onChange(String(n + 1))} aria-label="+">
          +
        </button>
      </div>
    </div>
  );
}

export function SaleForm({ sale }: { sale?: SaleDetail }) {
  const { t, locale, dir, errorMessage } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const invalidate = useInvalidate();
  const hotels = useHotels();
  const form = useDraft(sale ? saleToDraft(sale) : emptySale(user?.id ?? ''));
  const { draft: d, set, errors } = form;
  const [leave, setLeave] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const currency = asCurrency(d.currency) as CurrencyCode;
  const totals = computeSaleTotals({
    hotelCost: num(d.hotelCost) ?? 0, hotelSell: num(d.hotelSell) ?? 0,
    flightCost: num(d.flightCost) ?? 0, flightSell: num(d.flightSell) ?? 0, flightCommission: num(d.flightCommission) ?? 0,
    transferCost: num(d.transferCost) ?? 0, transferSell: num(d.transferSell) ?? 0,
    serviceCost: num(d.serviceCost) ?? 0, serviceSell: num(d.serviceSell) ?? 0,
    commissionRate: num(d.commissionRate) ?? 10,
    paid: sale ? sale.paid : num(d.payAmount) ?? 0,
  });
  const nights = countNights(d.startDate || null, d.endDate || null);
  const money = (v: number) => `${formatNumber(v, locale)} ${t.currencies[currency]}`;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (sale ? api.patch<SaleDetail>(`/sales/${sale.id}`, body) : api.post<SaleDetail>('/sales', body)),
    onSuccess: (saved) => {
      form.reset(saleToDraft(saved));
      invalidate('/sales');
      invalidate('/hotel-bookings');
      invalidate('/transfers');
      toast.success(sale ? t.common.saved : `${t.common.created} · ${saved.ref}`);
      router.push(`/sales/${saved.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'END_BEFORE_START') form.setErrors({ endDate: t.errors.END_BEFORE_START });
      toast.error(errorMessage(e));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!d.customerName.trim()) errs.customerName = t.common.required;
    if (d.startDate && d.endDate && d.endDate < d.startDate) errs.endDate = t.errors.END_BEFORE_START;
    if (Object.keys(errs).length) {
      form.setErrors(errs);
      formRef.current?.querySelector<HTMLElement>(`#s-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    save.mutate(payload(d, !sale));
  };

  const back = sale ? `/sales/${sale.id}` : '/sales';
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const line = (
    key: 'hotel' | 'flight' | 'transfer' | 'service',
    icon: React.ReactNode,
    label: string,
    details: React.ReactNode,
    profit: number,
    withCommission = false,
  ) => (
    <div className="grid grid-cols-2 items-end gap-2 border-b py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,0.9fr)]">
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
        <span className="flex items-center gap-1.5 text-[0.8rem] font-semibold">
          {icon}
          {label}
        </span>
        {details}
      </div>
      <Field label={t.common.cost} htmlFor={`s-${key}Cost`}>
        <MoneyInput id={`s-${key}Cost`} value={d[`${key}Cost`]} onChange={(v) => set(`${key}Cost`, v)} />
      </Field>
      <Field label={t.common.sell} htmlFor={`s-${key}Sell`}>
        <MoneyInput id={`s-${key}Sell`} value={d[`${key}Sell`]} onChange={(v) => set(`${key}Sell`, v)} />
      </Field>
      {withCommission ? (
        <Field label={t.sales.commission} htmlFor="s-flightCommission">
          <MoneyInput id="s-flightCommission" value={d.flightCommission} onChange={(v) => set('flightCommission', v)} />
        </Field>
      ) : (
        <div className="hidden md:block" />
      )}
      <div className="flex h-9 items-center justify-end rounded-md bg-surface-sunken px-2.5 text-sm">
        <span className={cn('tabular font-medium', profit < 0 && 'text-danger', profit > 0 && 'text-success')}>{formatNumber(profit, locale)}</span>
      </div>
    </div>
  );

  return (
    <form ref={formRef} onSubmit={submit} noValidate autoComplete="off" className="mx-auto max-w-[1200px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 animate-rise">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => (form.dirty ? setLeave(back) : router.push(back))}
            aria-label={t.common.back}
          >
            <BackIcon />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{sale ? `${t.sales.edit} · ${sale.ref}` : t.sales.new}</h1>
            <p className="text-sm text-muted-foreground">{t.sales.pricingHint}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="space-y-5 rounded-xl border bg-card p-5 shadow-xs animate-rise [animation-delay:40ms]">
            <FormSection title={t.sales.customerSection}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.sales.customerName} htmlFor="s-customerName" required error={errors.customerName} className="sm:col-span-2">
                  <Input id="s-customerName" value={d.customerName} onChange={(e) => set('customerName', e.target.value)} invalid={Boolean(errors.customerName)} autoFocus={!sale} />
                </Field>
                <Field label={t.sales.phone} htmlFor="s-phone">
                  <Input id="s-phone" type="tel" inputMode="tel" dir="ltr" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
                </Field>
                <Field label={t.common.nationality} htmlFor="s-nationality">
                  <SuggestInput id="s-nationality" field="nationality" value={d.nationality} onChange={(v) => set('nationality', v)} />
                </Field>
                <Field label={t.sales.destination} htmlFor="s-destination" hint={t.sales.destinationHint}>
                  <SuggestInput id="s-destination" field="destination" value={d.destination} onChange={(v) => set('destination', v)} />
                </Field>
                <Field label={t.sales.hotel} htmlFor="s-hotelName">
                  <>
                    <Input id="s-hotelName" list="s-hotels" value={d.hotelName} onChange={(e) => set('hotelName', e.target.value)} />
                    <datalist id="s-hotels">
                      {(hotels.data ?? []).map((h) => (
                        <option key={h.id} value={h.name} />
                      ))}
                    </datalist>
                  </>
                </Field>
              </div>
            </FormSection>

            <FormSection title={t.sales.paxSection}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                <Count id="s-adults" label={t.sales.adults} value={d.adults} onChange={(v) => set('adults', v)} />
                <Count id="s-children" label={t.sales.children} value={d.children} onChange={(v) => set('children', v)} />
                <Count id="s-singleRooms" label={t.sales.single} value={d.singleRooms} onChange={(v) => set('singleRooms', v)} />
                <Count id="s-doubleRooms" label={t.sales.double} value={d.doubleRooms} onChange={(v) => set('doubleRooms', v)} />
                <Count id="s-tripleRooms" label={t.sales.triple} value={d.tripleRooms} onChange={(v) => set('tripleRooms', v)} />
              </div>
            </FormSection>

            <FormSection title={t.sales.datesSection}>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <Field label={t.sales.start} htmlFor="s-startDate">
                  <Input id="s-startDate" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
                </Field>
                <Field
                  label={t.sales.end}
                  htmlFor="s-endDate"
                  error={errors.endDate}
                  hint={nights !== null ? t.common.night(nights) : undefined}
                >
                  <Input id="s-endDate" type="date" min={d.startDate || undefined} value={d.endDate} onChange={(e) => set('endDate', e.target.value)} invalid={Boolean(errors.endDate)} />
                </Field>
                <Field label={t.sales.saleDate} htmlFor="s-saleDate">
                  <Input id="s-saleDate" type="date" value={d.saleDate} onChange={(e) => set('saleDate', e.target.value)} />
                </Field>
              </div>
            </FormSection>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-xs animate-rise [animation-delay:80ms]">
            <FormSection
              title={t.sales.pricingSection}
              hint={t.sales.pricingHint}
              aside={
                <div className="w-44">
                  <CurrencySelect id="s-currency" value={currency} onChange={(v) => set('currency', v)} />
                </div>
              }
            >
              <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,0.9fr)] gap-2 border-b pb-2 text-end text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span className="text-start">{t.sales.service}</span>
                <span />
                <span />
                <span />
                <span>{t.common.profit}</span>
              </div>
              {line('hotel', <BedDouble className="size-4 text-muted-foreground" />, t.sales.lineHotel,
                <span className="truncate text-xs text-muted-foreground">{d.hotelName || '—'}</span>, totals.hotelProfit)}
              {line('flight', <Plane className="size-4 text-muted-foreground" />, t.sales.lineFlight,
                <Input aria-label={t.sales.flightDetails} placeholder={t.sales.flightDetails} value={d.flightDetails} onChange={(e) => set('flightDetails', e.target.value)} />,
                totals.flightProfit, true)}
              {line('transfer', <CarFront className="size-4 text-muted-foreground" />, t.sales.lineTransfer,
                <Input aria-label={t.sales.transferDetails} placeholder={t.sales.transferDetails} value={d.transferDetails} onChange={(e) => set('transferDetails', e.target.value)} />,
                totals.transferProfit)}
              {line('service', <Sparkles className="size-4 text-muted-foreground" />, t.sales.lineService,
                <SuggestInput field="serviceType" aria-label={t.sales.serviceType} placeholder={t.sales.serviceType} value={d.serviceType} onChange={(v) => set('serviceType', v)} />,
                totals.serviceProfit)}
              <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
                {(
                  [
                    [t.sales.totalCost, totals.totalCost, ''],
                    [t.sales.totalSell, totals.totalSell, ''],
                    [t.sales.totalProfit, totals.totalProfit, totals.totalProfit < 0 ? 'text-danger' : 'text-success'],
                  ] as const
                ).map(([label, value, cls]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className={cn('tabular font-semibold', cls)}>{money(value)}</dd>
                  </div>
                ))}
              </dl>
            </FormSection>
          </section>

          <section className="space-y-5 rounded-xl border bg-card p-5 shadow-xs animate-rise [animation-delay:120ms]">
            <FormSection title={t.sales.seller}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.sales.seller} htmlFor="s-sellerId">
                  <SellerSelect id="s-sellerId" value={d.sellerId || null} onChange={(v) => set('sellerId', v ?? '')} />
                </Field>
                <Field label={t.sales.commissionRate} htmlFor="s-commissionRate">
                  <Input id="s-commissionRate" inputMode="decimal" dir="ltr" value={d.commissionRate} onChange={(e) => set('commissionRate', e.target.value.replace(/[^\d.]/g, ''))} className="tabular" />
                </Field>
              </div>
            </FormSection>

            {!sale ? (
              <FormSection title={t.sales.firstPayment} hint={t.sales.firstPaymentHint}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t.sales.paymentAmount} htmlFor="s-payAmount">
                    <MoneyInput id="s-payAmount" value={d.payAmount} onChange={(v) => set('payAmount', v)} />
                  </Field>
                  <Field label={t.sales.paidOn} htmlFor="s-payDate">
                    <Input id="s-payDate" type="date" value={d.payDate} onChange={(e) => set('payDate', e.target.value)} />
                  </Field>
                  <Field label={t.sales.method} htmlFor="s-payMethod">
                    <NativeSelect id="s-payMethod" value={d.payMethod} onChange={(e) => set('payMethod', e.target.value)}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {t.paymentMethod[m as SalePaymentMethod]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              </FormSection>
            ) : null}

            {!sale ? (
              <FormSection title={t.sales.opsSection} hint={t.sales.opsHint}>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['reqHotel', t.sales.requestHotel, BedDouble],
                      ['reqTransfer', t.sales.requestTransfer, CarFront],
                    ] as const
                  ).map(([key, label, Icon]) => (
                    <label
                      key={key}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                        d[key] ? 'border-primary bg-accent font-medium text-accent-foreground' : 'bg-surface hover:bg-accent/50',
                      )}
                    >
                      <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={Boolean(d[key])} onChange={(e) => set(key, e.target.checked ? 'yes' : '')} />
                      <Icon className="size-4 text-muted-foreground" />
                      {label}
                    </label>
                  ))}
                </div>
              </FormSection>
            ) : null}

            <FormSection title={t.common.notes}>
              <Field label={t.common.status}>
                <StatusPicker value={asStatus(d.status)} onChange={(s) => set('status', s)} type="SALE" />
              </Field>
              <Field label={t.common.notes} htmlFor="s-notes">
                <Textarea id="s-notes" value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t.sales.notesPlaceholder} rows={3} />
              </Field>
            </FormSection>
          </section>
        </div>

        {/* The sheet's "الحسابات" columns, live. */}
        <aside className="xl:sticky xl:top-[calc(theme(spacing.topbar)+1.25rem)] xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm animate-rise [animation-delay:100ms]">
            <div className="bg-brand-900 px-5 py-4 text-white">
              <p className="text-xs text-white/60">{t.sales.totalProfit}</p>
              <p className={cn('tabular mt-1 text-2xl font-semibold', totals.totalProfit < 0 && 'text-red-300')}>{money(totals.totalProfit)}</p>
            </div>
            <dl className="space-y-2.5 px-5 py-4 text-sm">
              {[
                [t.sales.totalCost, totals.totalCost],
                [t.sales.totalSell, totals.totalSell],
                [`${t.sales.sellerCommission} (${formatNumber(num(d.commissionRate) ?? 10, locale)}%)`, totals.commission],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular font-medium">{money(value as number)}</dd>
                </div>
              ))}
              <div className="my-1 border-t border-dashed" />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t.sales.customerTotal}</dt>
                <dd className="tabular font-semibold">{money(totals.customerTotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t.sales.paid}</dt>
                <dd className="tabular font-medium text-success">{money(totals.paid)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t.sales.remaining}</dt>
                <dd className={cn('tabular font-semibold', totals.remaining > 0 ? 'text-sun-foreground dark:text-sun' : 'text-success')}>
                  {totals.remaining > 0 || totals.customerTotal === 0 ? money(totals.remaining) : t.sales.paidInFull}
                </dd>
              </div>
            </dl>
            <div className="flex gap-2 border-t bg-surface-muted px-5 py-3">
              <Button variant="ghost" asChild>
                <Link href={back}>{t.common.cancel}</Link>
              </Button>
              <Button type="submit" className="flex-1" loading={save.isPending}>
                {sale ? t.common.saveChanges : t.sales.create}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(leave)}
        onOpenChange={(o) => !o && setLeave(null)}
        title={t.common.unsavedTitle}
        confirmLabel={t.common.discard}
        onConfirm={() => {
          const to = leave;
          setLeave(null);
          if (to) router.push(to);
        }}
      />
    </form>
  );
}
