'use client';

import { TentTree } from 'lucide-react';
import type { ExcursionItem } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { Input } from '@/components/ui/input';
import { Field, FormSection } from '@/components/shared/field';
import { DateText, Pax, Txt } from '@/components/shared/format';
import { SuggestInput } from '@/components/shared/pickers';
import type { FormProps, OpsConfig } from './ops-page';
import { GuestFields, PriceFields, StatusAndNotes } from './form-parts';
import { AgencyCell, GuestCell, Sub, baseEmpty, basePayload, baseToDraft, int, priceItems, refColumn, requireFields, str, toStr } from './common';

function ExcursionForm({ draft, set, errors }: FormProps<ExcursionItem>) {
  const { t } = useI18n();
  return (
    <>
      <GuestFields draft={draft} set={set} errors={errors} withPax />
      <FormSection title={t.ops.serviceSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.excursions.activity} htmlFor="f-activity" required error={errors.activity} hint={t.excursions.activityHint} className="sm:col-span-2">
            <SuggestInput id="f-activity" field="activity" value={draft.activity} onChange={(v) => set('activity', v)} invalid={Boolean(errors.activity)} />
          </Field>
          <Field label={t.common.date} htmlFor="f-date">
            <Input id="f-date" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label={t.common.time} htmlFor="f-time">
            <Input id="f-time" type="time" value={draft.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
          <Field label={t.excursions.hotel} htmlFor="f-hotelName" className="sm:col-span-2">
            <Input id="f-hotelName" value={draft.hotelName} onChange={(e) => set('hotelName', e.target.value)} />
          </Field>
        </div>
      </FormSection>
      <PriceFields draft={draft} set={set} errors={errors} />
      <StatusAndNotes draft={draft} set={set} errors={errors} type="EXCURSION" />
    </>
  );
}

export const excursionsConfig: OpsConfig<ExcursionItem> = {
  type: 'EXCURSION',
  endpoint: '/excursions',
  icon: TentTree,
  title: (t) => t.excursions.title,
  subtitle: (t) => t.excursions.subtitle,
  searchPlaceholder: (t) => `${t.common.search}: ${t.ops.guestName}، ${t.excursions.activity}…`,
  columns: [
    refColumn,
    {
      key: 'date',
      header: (t) => t.common.date,
      sortKey: 'date',
      cell: (x) => (
        <div className="whitespace-nowrap">
          <DateText value={x.date} />
          {x.time ? <Sub><span className="font-mono">{x.time}</span></Sub> : null}
        </div>
      ),
    },
    { key: 'guest', header: (t) => t.common.guest, cell: (x) => <GuestCell row={x} />, sortKey: 'guestName' },
    {
      key: 'activity',
      header: (t) => t.excursions.activity,
      sortKey: 'activity',
      cell: (x) => (
        <div className="min-w-[12rem] max-w-[22rem]">
          <div className="line-clamp-2 font-medium">
            <Txt>{x.activity}</Txt>
          </div>
          {x.hotelName ? <Sub>{x.hotelName}</Sub> : null}
        </div>
      ),
    },
    { key: 'pax', header: (t) => t.common.pax, cell: (x) => <Pax adults={x.adults} kids={x.children} />, className: 'w-16' },
    { key: 'agency', header: (t) => t.common.agency, cell: (x, { t }) => <AgencyCell row={x} t={t} />, sortKey: 'agency' },
  ],
  card: (x) => ({
    title: x.guestName,
    lines: [x.activity, [x.hotelName, x.agency?.name].filter(Boolean).join(' · ') || '—'],
    date: x.date,
  }),
  headline: (x) => ({
    title: x.guestName,
    subtitle: (
      <>
        {x.activity} · <DateText value={x.date} />
      </>
    ),
  }),
  details: (x, { t }) => [
    {
      title: t.ops.serviceSection,
      items: [
        { label: t.excursions.activity, value: x.activity, wide: true },
        { label: t.common.date, value: <DateText value={x.date} full /> },
        { label: t.common.time, value: x.time ? <span className="font-mono">{x.time}</span> : '—' },
        { label: t.excursions.hotel, value: x.hotelName ?? '—' },
        { label: t.common.pax, value: <Pax adults={x.adults} kids={x.children} /> },
      ],
    },
    {
      title: t.ops.guestSection,
      items: [
        { label: t.common.phone, value: x.phone ? <a href={`tel:${x.phone}`} className="ltr text-primary hover:underline">{x.phone}</a> : '—' },
        { label: t.common.nationality, value: x.nationality ?? '—' },
        { label: t.common.agency, value: x.agency?.name ?? '—' },
      ],
    },
    { title: t.ops.moneySection, items: priceItems(x, t) },
    ...(x.notes ? [{ title: t.common.notes, items: [{ label: t.common.notes, value: <p className="whitespace-pre-wrap font-normal">{x.notes}</p>, wide: true }] }] : []),
  ],
  Form: ExcursionForm,
  emptyDraft: () => baseEmpty({ activity: '', hotelName: '', date: '', time: '', adults: '', children: '' }),
  toDraft: (x) => ({
    ...baseToDraft(x),
    activity: x.activity,
    hotelName: toStr(x.hotelName),
    date: toStr(x.date),
    time: toStr(x.time),
    adults: toStr(x.adults),
    children: toStr(x.children),
  }),
  toPayload: (d) => ({
    ...basePayload(d),
    activity: (d.activity ?? '').trim(),
    hotelName: str(d.hotelName),
    date: d.date || null,
    time: str(d.time),
    adults: int(d.adults),
    children: int(d.children),
  }),
  validate: (d, t) => requireFields(d, t, ['guestName', 'activity']),
};
