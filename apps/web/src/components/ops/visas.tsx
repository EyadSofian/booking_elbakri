'use client';

import { FileBadge } from 'lucide-react';
import type { VisaItem } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { Input } from '@/components/ui/input';
import { Field, FormSection } from '@/components/shared/field';
import { DateText, Money } from '@/components/shared/format';
import type { FormProps, OpsConfig } from './ops-page';
import { GuestFields, PriceFields, StatusAndNotes } from './form-parts';
import { AgencyCell, GuestCell, Sub, baseEmpty, baseFromSale, basePayload, baseToDraft, int, priceItems, refColumn, requireFields, str, toStr } from './common';
import { RouteText } from './transfers';

function VisaForm({ draft, set, errors }: FormProps<VisaItem>) {
  const { t } = useI18n();
  return (
    <>
      <GuestFields draft={draft} set={set} errors={errors} />
      <FormSection title={t.ops.serviceSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.visas.pax} htmlFor="f-pax">
            <Input id="f-pax" inputMode="numeric" value={draft.pax} onChange={(e) => set('pax', e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
          <Field label={t.visas.travelDate} htmlFor="f-travelDate">
            <Input id="f-travelDate" type="date" value={draft.travelDate} onChange={(e) => set('travelDate', e.target.value)} />
          </Field>
          <Field label={t.visas.from} htmlFor="f-fromPlace">
            <Input id="f-fromPlace" value={draft.fromPlace} onChange={(e) => set('fromPlace', e.target.value)} placeholder="Beirut" />
          </Field>
          <Field label={t.visas.to} htmlFor="f-toPlace">
            <Input id="f-toPlace" value={draft.toPlace} onChange={(e) => set('toPlace', e.target.value)} placeholder="Cairo" />
          </Field>
          <Field label={t.visas.passport} htmlFor="f-passportNo" className="sm:col-span-2">
            <Input id="f-passportNo" dir="ltr" value={draft.passportNo} onChange={(e) => set('passportNo', e.target.value)} />
          </Field>
        </div>
      </FormSection>
      <PriceFields draft={draft} set={set} errors={errors} costLabel={t.visas.net} />
      <StatusAndNotes draft={draft} set={set} errors={errors} type="VISA" />
    </>
  );
}

export const visasConfig: OpsConfig<VisaItem> = {
  type: 'VISA',
  endpoint: '/visas',
  icon: FileBadge,
  title: (t) => t.visas.title,
  subtitle: (t) => t.visas.subtitle,
  searchPlaceholder: (t) => `${t.common.search}: ${t.ops.guestName}، ${t.visas.passport}…`,
  columns: [
    refColumn,
    { key: 'date', header: (t) => t.visas.travelDate, cell: (v) => <DateText value={v.travelDate} />, sortKey: 'travelDate' },
    { key: 'guest', header: (t) => t.common.guest, cell: (v) => <GuestCell row={v} />, sortKey: 'guestName' },
    { key: 'pax', header: (t) => t.visas.pax, cell: (v) => <span className="tabular">{v.pax}</span>, className: 'w-16' },
    {
      key: 'route',
      header: (t) => `${t.visas.from} ${t.common.arrow} ${t.visas.to}`,
      cell: (v) => (
        <div className="min-w-[10rem]">
          <RouteText from={v.fromPlace} to={v.toPlace} />
          {v.passportNo ? <Sub><span className="ltr font-mono">{v.passportNo}</span></Sub> : null}
        </div>
      ),
    },
    { key: 'agency', header: (t) => t.common.agency, cell: (v, { t }) => <AgencyCell row={v} t={t} />, sortKey: 'agency' },
    {
      key: 'price',
      header: (t) => `${t.visas.net} / ${t.common.sell}`,
      cell: (v) => (
        <div className="whitespace-nowrap">
          <Money value={v.cost} currency={v.currency} muted />
          <Sub>
            <Money value={v.sell} currency={v.currency} />
          </Sub>
        </div>
      ),
    },
  ],
  card: (v) => ({
    title: v.guestName,
    lines: [<RouteText key="r" from={v.fromPlace} to={v.toPlace} />, [v.agency?.name, `${v.pax}`].filter(Boolean).join(' · ')],
    date: v.travelDate,
  }),
  headline: (v) => ({
    title: v.guestName,
    subtitle: (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <RouteText from={v.fromPlace} to={v.toPlace} /> · <DateText value={v.travelDate} />
      </span>
    ),
  }),
  details: (v, { t }) => [
    {
      title: t.ops.serviceSection,
      items: [
        { label: t.visas.pax, value: v.pax },
        { label: t.visas.travelDate, value: <DateText value={v.travelDate} full /> },
        { label: t.visas.from, value: v.fromPlace ?? '—' },
        { label: t.visas.to, value: v.toPlace ?? '—' },
        { label: t.visas.passport, value: v.passportNo ? <span className="ltr font-mono">{v.passportNo}</span> : '—' },
      ],
    },
    {
      title: t.ops.guestSection,
      items: [
        { label: t.common.phone, value: v.phone ? <a href={`tel:${v.phone}`} className="ltr text-primary hover:underline">{v.phone}</a> : '—' },
        { label: t.common.nationality, value: v.nationality ?? '—' },
        { label: t.common.agency, value: v.agency?.name ?? '—' },
      ],
    },
    { title: t.ops.moneySection, items: priceItems(v, t, t.visas.net) },
    ...(v.notes ? [{ title: t.common.notes, items: [{ label: t.common.notes, value: <p className="whitespace-pre-wrap font-normal">{v.notes}</p>, wide: true }] }] : []),
  ],
  Form: VisaForm,
  emptyDraft: () => baseEmpty({ currency: 'USD', pax: '1', fromPlace: '', toPlace: '', travelDate: '', passportNo: '' }),
  toDraft: (v) => ({
    ...baseToDraft(v),
    pax: toStr(v.pax),
    fromPlace: toStr(v.fromPlace),
    toPlace: toStr(v.toPlace),
    travelDate: toStr(v.travelDate),
    passportNo: toStr(v.passportNo),
  }),
  toPayload: (d) => ({
    ...basePayload(d),
    pax: int(d.pax) || 1,
    fromPlace: str(d.fromPlace),
    toPlace: str(d.toPlace),
    travelDate: d.travelDate || null,
    passportNo: str(d.passportNo),
  }),
  validate: (d, t) => requireFields(d, t, ['guestName']),
  fromSale: (s) =>
    baseFromSale(s, {
      pax: String(Math.max(1, (s.adults ?? 0) + (s.children ?? 0))),
      fromPlace: '',
      toPlace: '',
      travelDate: toStr(s.startDate),
      passportNo: '',
    }),
};
