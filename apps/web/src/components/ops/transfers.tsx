'use client';

import { ArrowRight, CarFront, PlaneLanding, PlaneTakeoff, Repeat2, Route, UserX } from 'lucide-react';
import { TRANSFER_KINDS, type TransferItem, type TransferKind } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, FormSection, Segmented } from '@/components/shared/field';
import { DateText, Pax, Txt } from '@/components/shared/format';
import { SuggestInput } from '@/components/shared/pickers';
import type { FormProps, OpsConfig } from './ops-page';
import { GuestFields, PriceFields, StatusAndNotes } from './form-parts';
import { AgencyCell, GuestCell, Sub, baseEmpty, baseFromSale, basePayload, baseToDraft, int, priceItems, refColumn, requireFields, str, toStr } from './common';

const KIND_ICON: Record<TransferKind, typeof PlaneLanding> = { ARRIVAL: PlaneLanding, DEPARTURE: PlaneTakeoff, TRANSFER: Route };
const AIRPORT = /air\s?port|airpor|مطار|\b(ssh|hrg|cai|rmf|hbe|lxr|asw)\b/i;

function guessKind(from: string, to: string): TransferKind {
  if (AIRPORT.test(from)) return 'ARRIVAL';
  if (AIRPORT.test(to)) return 'DEPARTURE';
  return 'TRANSFER';
}

export function KindBadge({ kind }: { kind: TransferKind }) {
  const { t } = useI18n();
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" />
      {t.transferKind[kind]}
    </span>
  );
}

/** "Airport → Hotel", arrow pointing the reading direction. */
export function RouteText({ from, to, className }: { from: string | null; to: string | null; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className="bidi truncate">{from ?? '—'}</span>
      <ArrowRight className="flip-rtl size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="bidi truncate">{to ?? '—'}</span>
    </span>
  );
}

function TransferForm({ draft, set, errors }: FormProps<TransferItem>) {
  const { t } = useI18n();
  const kind = (draft.kind || guessKind(draft.fromPlace, draft.toPlace)) as TransferKind;
  return (
    <>
      <GuestFields draft={draft} set={set} errors={errors} withPax />

      <FormSection title={t.ops.serviceSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.transfers.kind} className="sm:col-span-2">
            <Segmented<TransferKind>
              name="kind"
              value={kind}
              onChange={(k) => set('kind', k)}
              options={TRANSFER_KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                return { value: k, label: <><Icon className="size-3.5" />{t.transferKind[k]}</> };
              })}
            />
          </Field>
          <Field label={t.common.date} htmlFor="f-date" required error={errors.date}>
            <Input id="f-date" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} invalid={Boolean(errors.date)} />
          </Field>
          <Field label={t.transfers.pickup} htmlFor="f-time">
            <Input id="f-time" type="time" value={draft.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
          <Field label={t.transfers.from} htmlFor="f-fromPlace">
            <SuggestInput id="f-fromPlace" field="place" value={draft.fromPlace} onChange={(v) => set('fromPlace', v)} />
          </Field>
          <Field label={t.transfers.to} htmlFor="f-toPlace">
            <SuggestInput id="f-toPlace" field="place" value={draft.toPlace} onChange={(v) => set('toPlace', v)} />
          </Field>
          <Field label={t.transfers.flight} htmlFor="f-flightNo">
            <Input id="f-flightNo" dir="ltr" className="uppercase" value={draft.flightNo} onChange={(e) => set('flightNo', e.target.value)} placeholder="MS 710" />
          </Field>
        </div>
      </FormSection>

      <FormSection title={t.transfers.driverSection}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t.transfers.driverName} htmlFor="f-driverName">
            <Input id="f-driverName" value={draft.driverName} onChange={(e) => set('driverName', e.target.value)} />
          </Field>
          <Field label={t.transfers.driverPhone} htmlFor="f-driverPhone">
            <Input id="f-driverPhone" type="tel" inputMode="tel" dir="ltr" value={draft.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} />
          </Field>
          <Field label={t.transfers.vehicle} htmlFor="f-vehicle">
            <SuggestInput id="f-vehicle" field="vehicle" value={draft.vehicle} onChange={(v) => set('vehicle', v)} />
          </Field>
        </div>
      </FormSection>

      <PriceFields draft={draft} set={set} errors={errors} />
      <StatusAndNotes draft={draft} set={set} errors={errors} type="TRANSFER" />
    </>
  );
}

function DriverCell({ row }: { row: TransferItem }) {
  const { t } = useI18n();
  if (!row.driverName) {
    if (row.status === 'DONE' || row.status === 'CANCELLED') return <span className="text-muted-foreground/60">—</span>;
    return (
      <Badge variant="sun" className="gap-1">
        <UserX className="size-3" />
        {t.dashboard.noDriver}
      </Badge>
    );
  }
  return (
    <div className="max-w-[9rem]">
      <div className="truncate">{row.driverName}</div>
      {row.driverPhone || row.vehicle ? <Sub>{[row.vehicle, row.driverPhone].filter(Boolean).join(' · ')}</Sub> : null}
    </div>
  );
}

export const transfersConfig: OpsConfig<TransferItem> = {
  type: 'TRANSFER',
  endpoint: '/transfers',
  icon: CarFront,
  title: (t) => t.transfers.title,
  subtitle: (t) => t.transfers.subtitle,
  searchPlaceholder: (t) => `${t.common.search}: ${t.ops.guestName}، ${t.transfers.flight}، ${t.transfers.driver}…`,
  columns: [
    refColumn,
    {
      key: 'date',
      header: (t) => t.common.date,
      sortKey: 'date',
      cell: (r) => (
        <div className="whitespace-nowrap">
          <div className="flex items-baseline gap-2">
            <span className="ltr tabular font-mono text-[0.95rem] font-semibold">{r.time ?? '--:--'}</span>
            <DateText value={r.date} className="text-muted-foreground" />
          </div>
          {r.flightNo ? <Sub><span className="ltr font-mono">{r.flightNo}</span></Sub> : null}
        </div>
      ),
    },
    {
      key: 'guest',
      header: (t) => t.common.guest,
      sortKey: 'guestName',
      cell: (r) => (
        <div className="min-w-[9rem] max-w-[14rem]">
          <div className="truncate font-medium">
            <Txt>{r.guestName}</Txt>
          </div>
          <Sub>
            <Pax adults={r.adults} kids={r.children} /> · {[r.nationality, r.phone].filter(Boolean).join(' · ') || '—'}
          </Sub>
        </div>
      ),
    },
    {
      key: 'route',
      header: (t) => `${t.transfers.from} ${t.common.arrow} ${t.transfers.to}`,
      cell: (r) => (
        <div className="min-w-[12rem] max-w-[20rem]">
          <RouteText from={r.fromPlace} to={r.toPlace} className="max-w-full" />
          <Sub>
            <KindBadge kind={r.kind} />
          </Sub>
        </div>
      ),
    },
    { key: 'driver', header: (t) => t.transfers.driver, cell: (r) => <DriverCell row={r} /> },
    { key: 'agency', header: (t) => t.common.agency, cell: (r, { t }) => <AgencyCell row={r} t={t} />, sortKey: 'agency' },
  ],
  card: (r) => ({
    title: r.guestName,
    lines: [
      <RouteText key="route" from={r.fromPlace} to={r.toPlace} className="max-w-full" />,
      [r.time, r.flightNo, r.driverName].filter(Boolean).join(' · ') || '—',
    ],
    date: r.date,
  }),
  filters: [
    {
      param: 'assigned',
      label: (t) => t.transfers.driver,
      options: (t) => [
        { value: '', label: t.transfers.anyDriver },
        { value: 'no', label: t.transfers.unassigned },
        { value: 'yes', label: t.transfers.assigned },
      ],
    },
    {
      param: 'kind',
      label: (t) => t.transfers.kind,
      options: (t) => [{ value: '', label: `${t.transfers.kind}: ${t.common.all}` }, ...TRANSFER_KINDS.map((k) => ({ value: k, label: t.transferKind[k] }))],
    },
  ],
  headline: (r) => ({
    title: r.guestName,
    subtitle: (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <RouteText from={r.fromPlace} to={r.toPlace} />
        <span>·</span>
        <DateText value={r.date} /> {r.time ? <span className="font-mono">{r.time}</span> : null}
      </span>
    ),
  }),
  details: (r, { t }) => [
    {
      title: t.ops.serviceSection,
      items: [
        { label: t.transfers.kind, value: <KindBadge kind={r.kind} /> },
        { label: t.common.date, value: <DateText value={r.date} full /> },
        { label: t.transfers.pickup, value: r.time ? <span className="font-mono">{r.time}</span> : '—' },
        { label: t.transfers.from, value: r.fromPlace ?? '—' },
        { label: t.transfers.to, value: r.toPlace ?? '—' },
        { label: t.transfers.flight, value: r.flightNo ? <span className="ltr font-mono">{r.flightNo}</span> : '—' },
        { label: t.common.pax, value: <Pax adults={r.adults} kids={r.children} /> },
      ],
    },
    {
      title: t.transfers.driverSection,
      items: [
        { label: t.transfers.driverName, value: r.driverName ?? <DriverCell row={r} /> },
        { label: t.transfers.driverPhone, value: r.driverPhone ? <a href={`tel:${r.driverPhone}`} className="ltr text-primary hover:underline">{r.driverPhone}</a> : '—' },
        { label: t.transfers.vehicle, value: r.vehicle ?? '—' },
      ],
    },
    {
      title: t.ops.guestSection,
      items: [
        { label: t.common.phone, value: r.phone ? <a href={`tel:${r.phone}`} className="ltr text-primary hover:underline">{r.phone}</a> : '—' },
        { label: t.common.nationality, value: r.nationality ?? '—' },
        { label: t.common.agency, value: r.agency?.name ?? '—' },
      ],
    },
    { title: t.ops.moneySection, items: priceItems(r, t) },
    ...(r.notes ? [{ title: t.common.notes, items: [{ label: t.common.notes, value: <p className="whitespace-pre-wrap font-normal">{r.notes}</p>, wide: true }] }] : []),
  ],
  Form: TransferForm,
  emptyDraft: () =>
    baseEmpty({ kind: '', adults: '', children: '', date: '', time: '', fromPlace: '', toPlace: '', flightNo: '', driverName: '', driverPhone: '', vehicle: '' }),
  toDraft: (r) => ({
    ...baseToDraft(r),
    kind: r.kind,
    adults: toStr(r.adults),
    children: toStr(r.children),
    date: toStr(r.date),
    time: toStr(r.time),
    fromPlace: toStr(r.fromPlace),
    toPlace: toStr(r.toPlace),
    flightNo: toStr(r.flightNo),
    driverName: toStr(r.driverName),
    driverPhone: toStr(r.driverPhone),
    vehicle: toStr(r.vehicle),
  }),
  toPayload: (d) => ({
    ...basePayload(d),
    kind: d.kind || guessKind(d.fromPlace, d.toPlace),
    adults: int(d.adults),
    children: int(d.children),
    date: d.date || null,
    time: str(d.time),
    fromPlace: str(d.fromPlace),
    toPlace: str(d.toPlace),
    flightNo: str(d.flightNo),
    driverName: str(d.driverName),
    driverPhone: str(d.driverPhone),
    vehicle: str(d.vehicle),
  }),
  validate: (d, t) => requireFields(d, t, ['guestName', 'date']),
  fromSale: (s) =>
    baseFromSale(s, {
      kind: 'ARRIVAL',
      adults: toStr(s.adults),
      children: toStr(s.children || ''),
      date: toStr(s.startDate),
      time: '',
      fromPlace: '',
      toPlace: s.hotelName ?? '',
      flightNo: '',
      driverName: '',
      driverPhone: '',
      vehicle: '',
      cost: s.transferCost ? toStr(s.transferCost) : '',
      sell: s.transferSell ? toStr(s.transferSell) : '',
      notes: s.transferDetails ?? '',
    }),
  extraActions: (r, { t }) => [
    {
      label: t.ops.addReturn,
      icon: Repeat2,
      // The way back: same guest, places swapped, arrival becomes departure.
      draft: {
        ...transfersConfig.toDraft(r),
        status: 'NEW',
        kind: r.kind === 'ARRIVAL' ? 'DEPARTURE' : r.kind === 'DEPARTURE' ? 'ARRIVAL' : 'TRANSFER',
        fromPlace: toStr(r.toPlace),
        toPlace: toStr(r.fromPlace),
        date: '',
        time: '',
        flightNo: '',
        driverName: '',
        driverPhone: '',
        vehicle: '',
        notes: '',
      },
    },
  ],
};
