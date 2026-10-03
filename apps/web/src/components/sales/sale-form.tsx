'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, BedDouble, CarFront, Plane, Plus, Sparkles, X } from 'lucide-react';
import {
  PAYMENT_METHODS, computeSaleTotals, countNights, pricingFromLines, saleLineProfit, type CurrencyCode, type SaleDetail,
  type SaleLineKind, type SalePaymentMethod,
} from '@elbakri/shared';
import type { Dictionary } from '@/i18n/dictionaries/en';
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
import { Attachments, uploadPending, type PendingFile } from '@/components/shared/attachments';
import { MoneyInput } from '@/components/ops/form-parts';
import { asCurrency, asStatus, int, num, str, toStr, useDraft, type Draft } from '@/components/ops/draft';

export const LINE_ICON: Record<SaleLineKind, typeof BedDouble> = { HOTEL: BedDouble, FLIGHT: Plane, TRANSFER: CarFront, SERVICE: Sparkles };

export function lineLabel(t: Dictionary, kind: SaleLineKind): string {
  return { HOTEL: t.sales.lineHotel, FLIGHT: t.sales.lineFlight, TRANSFER: t.sales.lineTransfer, SERVICE: t.sales.lineService }[kind];
}

/** One item on the form; every input is a string, like the rest of the draft. */
interface LineDraft {
  key: string;
  kind: SaleLineKind;
  title: string;
  startDate: string;
  endDate: string;
  singleRooms: string;
  doubleRooms: string;
  tripleRooms: string;
  cost: string;
  sell: string;
  commission: string;
}

let nextKey = 0;
const newKey = () => `l${(nextKey += 1)}`;

function newLine(kind: SaleLineKind, start: string, end: string): LineDraft {
  return {
    key: newKey(), kind, title: '', startDate: start, endDate: kind === 'HOTEL' ? end : '',
    singleRooms: '0', doubleRooms: kind === 'HOTEL' ? '1' : '0', tripleRooms: '0', cost: '', sell: '', commission: '',
  };
}

// The lines live in the draft as JSON so "unsaved changes" and reset cover them too.
const readLines = (d: Draft): LineDraft[] => JSON.parse(d.lines || '[]') as LineDraft[];
const writeLines = (lines: LineDraft[]) => JSON.stringify(lines);

const lineMoney = (l: LineDraft) => ({ kind: l.kind, cost: num(l.cost) ?? 0, sell: num(l.sell) ?? 0, commission: num(l.commission) ?? 0 });

function emptySale(sellerId: string): Draft {
  return {
    status: 'NEW', saleDate: todayIso(), customerName: '', nationality: '', phone: '', destination: '',
    adults: '2', children: '0', startDate: '', endDate: '', currency: 'EGP',
    lines: writeLines([newLine('HOTEL', '', '')]),
    sellerId, commissionRate: '10', notes: '',
    payAmount: '', payDate: todayIso(), payMethod: 'CASH',
  };
}

function saleToDraft(s: SaleDetail): Draft {
  const n = (v: number) => (v ? String(v) : '');
  return {
    status: s.status, saleDate: s.saleDate, customerName: s.customerName, nationality: toStr(s.nationality), phone: toStr(s.phone),
    destination: toStr(s.destination), adults: String(s.adults), children: String(s.children),
    startDate: toStr(s.startDate), endDate: toStr(s.endDate), currency: s.currency,
    lines: writeLines(
      s.lines.map((l) => ({
        key: newKey(), kind: l.kind, title: toStr(l.title), startDate: toStr(l.startDate), endDate: toStr(l.endDate),
        singleRooms: String(l.singleRooms), doubleRooms: String(l.doubleRooms), tripleRooms: String(l.tripleRooms),
        cost: n(l.cost), sell: n(l.sell), commission: n(l.commission),
      })),
    ),
    sellerId: s.seller?.id ?? '', commissionRate: String(s.commissionRate),
    notes: toStr(s.notes), payAmount: '', payDate: todayIso(), payMethod: 'CASH',
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
    adults: int(d.adults) ?? 0,
    children: int(d.children) ?? 0,
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    currency: d.currency,
    lines: readLines(d).map((l) => ({
      kind: l.kind,
      title: str(l.title),
      startDate: l.startDate || null,
      endDate: l.kind === 'HOTEL' ? l.endDate || null : null,
      singleRooms: int(l.singleRooms) ?? 0,
      doubleRooms: int(l.doubleRooms) ?? 0,
      tripleRooms: int(l.tripleRooms) ?? 0,
      cost: num(l.cost) ?? 0,
      sell: num(l.sell) ?? 0,
      commission: num(l.commission) ?? 0,
    })),
    sellerId: d.sellerId || null,
    commissionRate: num(d.commissionRate) ?? 10,
    notes: str(d.notes),
  };
  if (isNew) {
    const amount = num(d.payAmount);
    if (amount && amount > 0) body.initialPayment = { amount, paidOn: d.payDate || todayIso(), method: d.payMethod || null };
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

/** One item: what it is, when, the rooms for a hotel, and its money. */
function LineEditor({
  line,
  index,
  error,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  index: number;
  error?: string;
  onChange: (key: keyof LineDraft, value: string) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const Icon = LINE_ICON[line.kind];
  const id = (field: string) => `s-l${index}-${field}`;
  const hotel = line.kind === 'HOTEL';
  const nights = hotel ? countNights(line.startDate || null, line.endDate || null) : null;
  const profit = saleLineProfit(lineMoney(line));
  const titleLabel = { HOTEL: t.sales.hotel, FLIGHT: t.sales.flightDetails, TRANSFER: t.sales.transferDetails, SERVICE: t.sales.serviceType }[line.kind];

  return (
    <li className="space-y-3 rounded-lg border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-surface-sunken text-muted-foreground">
            <Icon className="size-4" />
          </span>
          {lineLabel(t, line.kind)}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`${t.sales.removeLine} ${lineLabel(t, line.kind)}`}>
          <X />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Field label={titleLabel} htmlFor={id('title')} className="sm:col-span-2">
          {hotel ? (
            <Input id={id('title')} list="s-hotels" value={line.title} onChange={(e) => onChange('title', e.target.value)} />
          ) : line.kind === 'SERVICE' ? (
            <SuggestInput id={id('title')} field="serviceType" value={line.title} onChange={(v) => onChange('title', v)} />
          ) : (
            <Input id={id('title')} value={line.title} onChange={(e) => onChange('title', e.target.value)} />
          )}
        </Field>
        <Field label={hotel ? t.sales.checkIn : t.sales.lineDate} htmlFor={id('startDate')}>
          <Input id={id('startDate')} type="date" value={line.startDate} onChange={(e) => onChange('startDate', e.target.value)} />
        </Field>
        {hotel ? (
          <Field label={t.sales.checkOut} htmlFor={id('endDate')} error={error} hint={nights !== null ? t.common.night(nights) : undefined}>
            <Input
              id={id('endDate')}
              type="date"
              min={line.startDate || undefined}
              value={line.endDate}
              onChange={(e) => onChange('endDate', e.target.value)}
              invalid={Boolean(error)}
            />
          </Field>
        ) : null}
      </div>

      {hotel ? (
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          <Count id={id('single')} label={t.sales.single} value={line.singleRooms} onChange={(v) => onChange('singleRooms', v)} />
          <Count id={id('double')} label={t.sales.double} value={line.doubleRooms} onChange={(v) => onChange('doubleRooms', v)} />
          <Count id={id('triple')} label={t.sales.triple} value={line.tripleRooms} onChange={(v) => onChange('tripleRooms', v)} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
        <Field label={t.common.cost} htmlFor={id('cost')}>
          <MoneyInput id={id('cost')} value={line.cost} onChange={(v) => onChange('cost', v)} />
        </Field>
        <Field label={t.common.sell} htmlFor={id('sell')}>
          <MoneyInput id={id('sell')} value={line.sell} onChange={(v) => onChange('sell', v)} />
        </Field>
        {line.kind === 'FLIGHT' ? (
          <Field label={t.sales.commission} htmlFor={id('commission')}>
            <MoneyInput id={id('commission')} value={line.commission} onChange={(v) => onChange('commission', v)} />
          </Field>
        ) : (
          <div className="hidden md:block" />
        )}
        <div className="flex h-9 items-center justify-between gap-2 rounded-md bg-surface-sunken px-2.5 text-sm">
          <span className="text-xs text-muted-foreground">{t.common.profit}</span>
          <span className={cn('tabular font-medium', profit < 0 && 'text-danger', profit > 0 && 'text-success')}>{formatNumber(profit, locale)}</span>
        </div>
      </div>
    </li>
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
  // Passport copies chosen on a new sale wait here and are uploaded once it is saved.
  const [pending, setPending] = React.useState<PendingFile[]>([]);

  const lines = readLines(d);
  const setLines = (next: LineDraft[]) => set('lines', writeLines(next));
  const changeLine = (i: number, key: keyof LineDraft, value: string) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  const addLine = (kind: SaleLineKind) => setLines([...lines, newLine(kind, d.startDate, d.endDate)]);
  const lineErrors = React.useMemo(
    () => Object.fromEntries(lines.map((l, i) => [i, l.kind === 'HOTEL' && l.startDate && l.endDate && l.endDate < l.startDate ? t.errors.CHECKOUT_BEFORE_CHECKIN : ''])),
    [lines, t],
  );

  const currency = asCurrency(d.currency) as CurrencyCode;
  const totals = computeSaleTotals(
    pricingFromLines(lines.map(lineMoney), num(d.commissionRate) ?? 10, sale ? sale.paid : num(d.payAmount) ?? 0),
  );
  const nights = countNights(d.startDate || null, d.endDate || null);
  const money = (v: number) => `${formatNumber(v, locale)} ${t.currencies[currency]}`;

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const saved = await (sale ? api.patch<SaleDetail>(`/sales/${sale.id}`, body) : api.post<SaleDetail>('/sales', body));
      const failed = pending.length ? await uploadPending('SALE', saved.id, pending) : 0;
      return { saved, failed };
    },
    onSuccess: ({ saved, failed }) => {
      form.reset(saleToDraft(saved));
      setPending([]);
      invalidate('/sales');
      toast.success(sale ? t.common.saved : `${t.common.created} · ${saved.ref}`);
      // The sale is saved either way; say so if a file did not make it.
      if (failed) toast.error(`${t.files.section}: ${t.errors.INTERNAL_ERROR}`);
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
    const badLine = Object.keys(lineErrors).find((i) => lineErrors[Number(i)]);
    if (Object.keys(errs).length || badLine !== undefined) {
      form.setErrors(errs);
      const target = Object.keys(errs)[0] ? `#s-${Object.keys(errs)[0]}` : `#s-l${badLine}-endDate`;
      formRef.current?.querySelector<HTMLElement>(target)?.focus();
      return;
    }
    save.mutate(payload(d, !sale));
  };

  const back = sale ? `/sales/${sale.id}` : '/sales';
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const addButtons: Array<[SaleLineKind, string]> = [
    ['HOTEL', t.sales.addHotel],
    ['FLIGHT', t.sales.addFlight],
    ['TRANSFER', t.sales.addTransfer],
    ['SERVICE', t.sales.addService],
  ];

  return (
    <form ref={formRef} onSubmit={submit} noValidate autoComplete="off" className="mx-auto max-w-[1200px]">
      <datalist id="s-hotels">
        {(hotels.data ?? []).map((h) => (
          <option key={h.id} value={h.name} />
        ))}
      </datalist>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 animate-rise">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => (form.dirty || pending.length ? setLeave(back) : router.push(back))}
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
                <Field label={t.sales.destination} htmlFor="s-destination" hint={t.sales.destinationHint} className="sm:col-span-2">
                  <SuggestInput id="s-destination" field="destination" value={d.destination} onChange={(v) => set('destination', v)} />
                </Field>
              </div>
            </FormSection>

            <FormSection title={t.sales.paxSection}>
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                <Count id="s-adults" label={t.sales.adults} value={d.adults} onChange={(v) => set('adults', v)} />
                <Count id="s-children" label={t.sales.children} value={d.children} onChange={(v) => set('children', v)} />
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
              title={t.sales.itemsSection}
              hint={t.sales.itemsHint}
              aside={
                <div className="w-44">
                  <CurrencySelect id="s-currency" value={currency} onChange={(v) => set('currency', v)} />
                </div>
              }
            >
              {lines.length ? (
                <ul className="space-y-3">
                  {lines.map((line, i) => (
                    <LineEditor
                      key={line.key}
                      line={line}
                      index={i}
                      error={lineErrors[i] || undefined}
                      onChange={(key, value) => changeLine(i, key, value)}
                      onRemove={() => setLines(lines.filter((_, j) => j !== i))}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{t.sales.itemsEmpty}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {addButtons.map(([kind, label]) => {
                  const Icon = LINE_ICON[kind];
                  return (
                    <Button key={kind} variant="outline" size="sm" onClick={() => addLine(kind)}>
                      <Plus />
                      <Icon className="text-muted-foreground" />
                      {label}
                    </Button>
                  );
                })}
              </div>

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

            <FormSection title={t.files.PASSPORT} hint={t.files.hint}>
              <Attachments entityType="SALE" entityId={sale?.id} kinds={['PASSPORT']} pending={pending} onPending={setPending} />
            </FormSection>

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
