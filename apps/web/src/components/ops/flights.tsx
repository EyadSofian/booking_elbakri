'use client';

import { Plane } from 'lucide-react';
import type { FlightItem } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { Input } from '@/components/ui/input';
import { Field, FormSection } from '@/components/shared/field';
import { DateText, Money } from '@/components/shared/format';
import type { FormProps, OpsConfig } from './ops-page';
import { GuestFields, PriceFields, StatusAndNotes } from './form-parts';
import { AgencyCell, GuestCell, Sub, baseEmpty, basePayload, baseToDraft, int, priceItems, refColumn, requireFields, str, toStr } from './common';
import { RouteText } from './transfers';

// The flights tab is the visas tab with flight names: the same traveller,
// route, date and passport, plus the airline, flight and ticket numbers.
function FlightForm({ draft, set, errors }: FormProps<FlightItem>) {
  const { t } = useI18n();
  return (
    <>
      <GuestFields draft={draft} set={set} errors={errors} />
      <FormSection title={t.ops.serviceSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.flights.from} htmlFor="f-fromPlace">
            <Input id="f-fromPlace" value={draft.fromPlace} onChange={(e) => set('fromPlace', e.target.value)} placeholder="Cairo" />
          </Field>
          <Field label={t.flights.to} htmlFor="f-toPlace">
            <Input id="f-toPlace" value={draft.toPlace} onChange={(e) => set('toPlace', e.target.value)} placeholder="Sharm El Sheikh" />
          </Field>
          <Field label={t.flights.travelDate} htmlFor="f-travelDate" required error={errors.travelDate}>
            <Input id="f-travelDate" type="date" value={draft.travelDate} onChange={(e) => set('travelDate', e.target.value)} invalid={Boolean(errors.travelDate)} />
          </Field>
          <Field label={t.flights.returnDate} htmlFor="f-returnDate" error={errors.returnDate}>
            <Input
              id="f-returnDate"
              type="date"
              min={draft.travelDate || undefined}
              value={draft.returnDate}
              onChange={(e) => set('returnDate', e.target.value)}
              invalid={Boolean(errors.returnDate)}
            />
          </Field>
          <Field label={t.flights.airline} htmlFor="f-airline">
            <Input id="f-airline" value={draft.airline} onChange={(e) => set('airline', e.target.value)} placeholder="EgyptAir" />
          </Field>
          <Field label={t.flights.flightNo} htmlFor="f-flightNo">
            <Input id="f-flightNo" dir="ltr" className="uppercase" value={draft.flightNo} onChange={(e) => set('flightNo', e.target.value)} placeholder="MS 710" />
          </Field>
          <Field label={t.flights.ticketNo} htmlFor="f-ticketNo">
            <Input id="f-ticketNo" dir="ltr" value={draft.ticketNo} onChange={(e) => set('ticketNo', e.target.value)} />
          </Field>
          <Field label={t.flights.passport} htmlFor="f-passportNo">
            <Input id="f-passportNo" dir="ltr" value={draft.passportNo} onChange={(e) => set('passportNo', e.target.value)} />
          </Field>
          <Field label={t.flights.pax} htmlFor="f-pax">
            <Input id="f-pax" inputMode="numeric" value={draft.pax} onChange={(e) => set('pax', e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
        </div>
      </FormSection>
      <PriceFields draft={draft} set={set} errors={errors} />
      <StatusAndNotes draft={draft} set={set} errors={errors} type="FLIGHT" />
    </>
  );
}

const mono = (v: string | null) => (v ? <span className="ltr font-mono">{v}</span> : '—');

export const flightsConfig: OpsConfig<FlightItem> = {
  type: 'FLIGHT',
  endpoint: '/flights',
  icon: Plane,
  title: (t) => t.flights.title,
  subtitle: (t) => t.flights.subtitle,
  searchPlaceholder: (t) => `${t.common.search}: ${t.ops.guestName}، ${t.flights.flightNo}، ${t.flights.ticketNo}…`,
  columns: [
    refColumn,
    {
      key: 'date',
      header: (t) => t.flights.travelDate,
      sortKey: 'travelDate',
      cell: (f, { t }) => (
        <div className="whitespace-nowrap">
          <DateText value={f.travelDate} />
          {f.returnDate ? (
            <Sub>
              {t.common.arrow} <DateText value={f.returnDate} />
            </Sub>
          ) : null}
        </div>
      ),
    },
    { key: 'guest', header: (t) => t.common.guest, cell: (f) => <GuestCell row={f} />, sortKey: 'guestName' },
    { key: 'pax', header: (t) => t.flights.pax, cell: (f) => <span className="tabular">{f.pax}</span>, className: 'w-16' },
    {
      key: 'route',
      header: (t) => `${t.flights.from} ${t.common.arrow} ${t.flights.to}`,
      cell: (f) => (
        <div className="min-w-[10rem]">
          <RouteText from={f.fromPlace} to={f.toPlace} />
          {f.airline || f.flightNo ? (
            <Sub>
              {[f.airline, f.flightNo].filter(Boolean).join(' · ')}
            </Sub>
          ) : null}
        </div>
      ),
    },
    { key: 'ticket', header: (t) => t.flights.ticketNo, cell: (f) => <span className="text-xs">{mono(f.ticketNo)}</span> },
    { key: 'agency', header: (t) => t.common.agency, cell: (f, { t }) => <AgencyCell row={f} t={t} />, sortKey: 'agency' },
    {
      key: 'price',
      header: (t) => `${t.common.cost} / ${t.common.sell}`,
      cell: (f) => (
        <div className="whitespace-nowrap">
          <Money value={f.cost} currency={f.currency} muted />
          <Sub>
            <Money value={f.sell} currency={f.currency} />
          </Sub>
        </div>
      ),
    },
  ],
  card: (f) => ({
    title: f.guestName,
    lines: [
      <RouteText key="r" from={f.fromPlace} to={f.toPlace} />,
      [f.airline, f.flightNo, `${f.pax}`].filter(Boolean).join(' · '),
    ],
    date: f.travelDate,
  }),
  headline: (f) => ({
    title: f.guestName,
    subtitle: (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <RouteText from={f.fromPlace} to={f.toPlace} /> · <DateText value={f.travelDate} />
      </span>
    ),
  }),
  details: (f, { t }) => [
    {
      title: t.ops.serviceSection,
      items: [
        { label: t.flights.from, value: f.fromPlace ?? '—' },
        { label: t.flights.to, value: f.toPlace ?? '—' },
        { label: t.flights.pax, value: f.pax },
        { label: t.flights.travelDate, value: <DateText value={f.travelDate} full /> },
        { label: t.flights.returnDate, value: <DateText value={f.returnDate} full /> },
        { label: t.flights.airline, value: f.airline ?? '—' },
        { label: t.flights.flightNo, value: mono(f.flightNo) },
        { label: t.flights.ticketNo, value: mono(f.ticketNo) },
        { label: t.flights.passport, value: mono(f.passportNo) },
      ],
    },
    {
      title: t.ops.guestSection,
      items: [
        { label: t.common.phone, value: f.phone ? <a href={`tel:${f.phone}`} className="ltr text-primary hover:underline">{f.phone}</a> : '—' },
        { label: t.common.nationality, value: f.nationality ?? '—' },
        { label: t.common.agency, value: f.agency?.name ?? '—' },
      ],
    },
    { title: t.ops.moneySection, items: priceItems(f, t) },
    ...(f.notes ? [{ title: t.common.notes, items: [{ label: t.common.notes, value: <p className="whitespace-pre-wrap font-normal">{f.notes}</p>, wide: true }] }] : []),
  ],
  Form: FlightForm,
  emptyDraft: () =>
    baseEmpty({ pax: '1', fromPlace: '', toPlace: '', travelDate: '', returnDate: '', airline: '', flightNo: '', ticketNo: '', passportNo: '' }),
  toDraft: (f) => ({
    ...baseToDraft(f),
    pax: toStr(f.pax),
    fromPlace: toStr(f.fromPlace),
    toPlace: toStr(f.toPlace),
    travelDate: toStr(f.travelDate),
    returnDate: toStr(f.returnDate),
    airline: toStr(f.airline),
    flightNo: toStr(f.flightNo),
    ticketNo: toStr(f.ticketNo),
    passportNo: toStr(f.passportNo),
  }),
  toPayload: (d) => ({
    ...basePayload(d),
    pax: int(d.pax) || 1,
    fromPlace: str(d.fromPlace),
    toPlace: str(d.toPlace),
    travelDate: d.travelDate || null,
    returnDate: d.returnDate || null,
    airline: str(d.airline),
    flightNo: str(d.flightNo),
    ticketNo: str(d.ticketNo),
    passportNo: str(d.passportNo),
  }),
  validate: (d, t) => {
    const errors = requireFields(d, t, ['guestName', 'travelDate']);
    if (d.travelDate && d.returnDate && d.returnDate < d.travelDate) errors.returnDate = t.errors.RETURN_BEFORE_OUTBOUND;
    return errors;
  },
};
