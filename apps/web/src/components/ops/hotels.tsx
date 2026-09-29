'use client';

import { Hotel } from 'lucide-react';
import { countNights, roomsText, type HotelBookingItem } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, FormSection } from '@/components/shared/field';
import { DateText, Money, Pax, Txt } from '@/components/shared/format';
import { HotelPicker, SuggestInput } from '@/components/shared/pickers';
import type { OpsConfig, FormProps } from './ops-page';
import { GuestFields, MoneyInput, StatusAndNotes } from './form-parts';
import { AgencyCell, GuestCell, Sub, baseEmpty, baseFromSale, basePayload, baseToDraft, int, num, refColumn, requireFields, str, toStr, today } from './common';
import { CurrencySelect } from '@/components/shared/pickers';
import { asCurrency } from './draft';

function owed(b: HotelBookingItem): number | null {
  if (b.cost == null) return null;
  return Math.round(((b.cost ?? 0) - (b.paidToHotel ?? 0)) * 100) / 100;
}

function PaymentCell({ b }: { b: HotelBookingItem }) {
  const { t } = useI18n();
  const rest = owed(b);
  if (rest === null) return <span className="text-muted-foreground/60">—</span>;
  if (rest <= 0) return <Badge variant="success">{t.hotels.paidUp}</Badge>;
  return (
    <div className="whitespace-nowrap">
      <Money value={rest} currency={b.currency} className="font-medium text-sun-foreground dark:text-sun" />
      <Sub>
        {t.hotels.dueShort} <Money value={b.cost} currency={b.currency} muted />
      </Sub>
    </div>
  );
}

function HotelForm({ draft, set, errors }: FormProps<HotelBookingItem>) {
  const { t } = useI18n();
  const nights = countNights(draft.checkIn || null, draft.checkOut || null);
  const rest = num(draft.cost) !== null ? Math.round(((num(draft.cost) ?? 0) - (num(draft.paidToHotel) ?? 0)) * 100) / 100 : null;
  return (
    <>
      <GuestFields draft={draft} set={set} errors={errors} />

      <FormSection title={t.ops.serviceSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.hotels.hotel} htmlFor="f-hotelId" required error={errors.hotelId} className="sm:col-span-2">
            <HotelPicker
              id="f-hotelId"
              value={draft.hotelId || null}
              valueLabel={draft.hotelName || null}
              onChange={(id, name) => {
                set('hotelId', id ?? '');
                set('hotelName', name ?? '');
              }}
              invalid={Boolean(errors.hotelId)}
            />
          </Field>
          <Field label={t.hotels.checkIn} htmlFor="f-checkIn" required error={errors.checkIn}>
            <Input id="f-checkIn" type="date" value={draft.checkIn} onChange={(e) => set('checkIn', e.target.value)} invalid={Boolean(errors.checkIn)} />
          </Field>
          <Field
            label={t.hotels.checkOut}
            htmlFor="f-checkOut"
            required
            error={errors.checkOut}
            hint={nights !== null ? t.common.night(nights) : undefined}
          >
            <Input
              id="f-checkOut"
              type="date"
              min={draft.checkIn || undefined}
              value={draft.checkOut}
              onChange={(e) => set('checkOut', e.target.value)}
              invalid={Boolean(errors.checkOut)}
            />
          </Field>
          <Field label={t.hotels.rooms} htmlFor="f-rooms" hint={t.hotels.roomsHint}>
            <SuggestInput id="f-rooms" field="rooms" value={draft.rooms} onChange={(v) => set('rooms', v)} />
          </Field>
          <Field label={t.hotels.mealPlan} htmlFor="f-mealPlan">
            <SuggestInput id="f-mealPlan" field="mealPlan" value={draft.mealPlan} onChange={(v) => set('mealPlan', v)} />
          </Field>
          <Field label={t.common.adults} htmlFor="f-adults">
            <Input id="f-adults" inputMode="numeric" value={draft.adults} onChange={(e) => set('adults', e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
          <Field label={t.common.children} htmlFor="f-children">
            <Input id="f-children" inputMode="numeric" value={draft.children} onChange={(e) => set('children', e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
          <Field label={t.hotels.bookingDate} htmlFor="f-bookingDate">
            <Input id="f-bookingDate" type="date" value={draft.bookingDate} onChange={(e) => set('bookingDate', e.target.value)} />
          </Field>
          <Field label={t.hotels.confirmationNo} htmlFor="f-confirmationNo">
            <Input id="f-confirmationNo" dir="ltr" value={draft.confirmationNo} onChange={(e) => set('confirmationNo', e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title={t.hotels.hotelPayment} hint={t.ops.moneyHint}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t.common.currency} htmlFor="f-currency">
            <CurrencySelect id="f-currency" value={asCurrency(draft.currency)} onChange={(v) => set('currency', v)} />
          </Field>
          <Field label={t.hotels.costToHotel} htmlFor="f-cost">
            <MoneyInput id="f-cost" value={draft.cost} onChange={(v) => set('cost', v)} />
          </Field>
          <Field label={t.hotels.paidToHotel} htmlFor="f-paidToHotel">
            <MoneyInput id="f-paidToHotel" value={draft.paidToHotel} onChange={(v) => set('paidToHotel', v)} />
          </Field>
          <Field label={t.hotels.hotelPaidOn} htmlFor="f-hotelPaidOn">
            <Input id="f-hotelPaidOn" type="date" value={draft.hotelPaidOn} onChange={(e) => set('hotelPaidOn', e.target.value)} />
          </Field>
          <Field label={t.hotels.sellToCustomer} htmlFor="f-sell">
            <MoneyInput id="f-sell" value={draft.sell} onChange={(v) => set('sell', v)} />
          </Field>
          <div className="flex flex-col justify-end rounded-lg bg-surface-sunken px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">{t.hotels.owed}</span>
            <span className="tabular font-semibold">{rest === null ? '—' : `${rest} ${t.currencies[asCurrency(draft.currency)]}`}</span>
          </div>
        </div>
      </FormSection>

      <StatusAndNotes draft={draft} set={set} errors={errors} type="HOTEL" />
    </>
  );
}

export const hotelsConfig: OpsConfig<HotelBookingItem> = {
  type: 'HOTEL',
  endpoint: '/hotel-bookings',
  icon: Hotel,
  title: (t) => t.hotels.title,
  subtitle: (t) => t.hotels.subtitle,
  searchPlaceholder: (t) => `${t.common.search}: ${t.ops.guestName}، ${t.hotels.hotel}، ${t.common.phone}…`,
  columns: [
    refColumn,
    { key: 'guest', header: (t) => t.common.guest, cell: (b) => <GuestCell row={b} />, sortKey: 'guestName' },
    {
      key: 'hotel',
      header: (t) => t.hotels.hotel,
      sortKey: 'hotel',
      cell: (b) => (
        <div className="min-w-[9rem] max-w-[13rem]">
          <div className="truncate font-medium">
            <Txt>{b.hotel?.name ?? '—'}</Txt>
          </div>
          <Sub>{[b.rooms, b.mealPlan].filter(Boolean).join(' · ') || '—'}</Sub>
        </div>
      ),
    },
    {
      key: 'dates',
      header: (t) => `${t.hotels.checkIn} ${t.common.arrow} ${t.hotels.checkOut}`,
      sortKey: 'checkIn',
      cell: (b, { t }) => (
        <div className="whitespace-nowrap">
          <DateText value={b.checkIn} />
          <Sub>
            {t.common.arrow} <DateText value={b.checkOut} />
            {b.nights != null ? ` · ${t.common.night(b.nights)}` : ''}
          </Sub>
        </div>
      ),
    },
    { key: 'agency', header: (t) => t.common.agency, cell: (b, { t }) => <AgencyCell row={b} t={t} />, sortKey: 'agency' },
    { key: 'payment', header: (t) => t.hotels.hotelPayment, cell: (b) => <PaymentCell b={b} /> },
  ],
  card: (b, { t }) => ({
    title: b.guestName,
    lines: [
      [b.hotel?.name, b.rooms].filter(Boolean).join(' · ') || '—',
      <>
        <DateText value={b.checkIn} /> {t.common.arrow} <DateText value={b.checkOut} />
        {b.nights != null ? ` · ${t.common.night(b.nights)}` : ''}
      </>,
      b.agency?.name ?? '',
    ],
    date: b.checkIn,
  }),
  filters: [
    {
      param: 'departing',
      label: (t) => t.hotels.checkOut,
      options: (t) => [
        { value: '', label: `${t.hotels.checkOut}: ${t.common.anyDate}` },
        { value: 'today', label: `${t.hotels.checkOut}: ${t.common.today}` },
        { value: 'tomorrow', label: `${t.hotels.checkOut}: ${t.common.tomorrow}` },
      ],
    },
    {
      param: 'payment',
      label: (t) => t.hotels.hotelPayment,
      options: (t) => [
        { value: '', label: `${t.hotels.hotelPayment}: ${t.common.all}` },
        { value: 'unpaid', label: t.hotels.unpaid },
      ],
    },
  ],
  headline: (b, { t }) => ({
    title: b.guestName,
    subtitle: (
      <>
        {b.hotel?.name ?? '—'} · <DateText value={b.checkIn} /> {t.common.arrow} <DateText value={b.checkOut} />
        {b.nights != null ? ` · ${t.common.night(b.nights)}` : ''}
      </>
    ),
  }),
  details: (b, { t }) => [
    {
      title: t.ops.serviceSection,
      items: [
        { label: t.hotels.hotel, value: b.hotel?.name ?? '—' },
        { label: t.hotels.checkIn, value: <DateText value={b.checkIn} full /> },
        { label: t.hotels.checkOut, value: <DateText value={b.checkOut} full /> },
        { label: t.common.nights, value: b.nights ?? '—' },
        { label: t.hotels.rooms, value: b.rooms ?? '—' },
        { label: t.hotels.mealPlan, value: b.mealPlan ?? '—' },
        { label: t.common.pax, value: <Pax adults={b.adults} kids={b.children} /> },
        { label: t.hotels.confirmationNo, value: b.confirmationNo ?? '—' },
        { label: t.hotels.bookingDate, value: <DateText value={b.bookingDate} full /> },
      ],
    },
    {
      title: t.ops.guestSection,
      items: [
        { label: t.common.phone, value: b.phone ? <a href={`tel:${b.phone}`} className="ltr text-primary hover:underline">{b.phone}</a> : '—' },
        { label: t.common.nationality, value: b.nationality ?? '—' },
        { label: t.common.agency, value: b.agency?.name ?? '—' },
      ],
    },
    {
      title: t.hotels.hotelPayment,
      items: [
        { label: t.hotels.costToHotel, value: <Money value={b.cost} currency={b.currency} /> },
        { label: t.hotels.paidToHotel, value: <Money value={b.paidToHotel} currency={b.currency} /> },
        { label: t.hotels.owed, value: <PaymentCell b={b} /> },
        { label: t.hotels.hotelPaidOn, value: <DateText value={b.hotelPaidOn} full /> },
        { label: t.hotels.sellToCustomer, value: <Money value={b.sell} currency={b.currency} /> },
      ],
    },
    ...(b.notes ? [{ title: t.common.notes, items: [{ label: t.common.notes, value: <p className="whitespace-pre-wrap font-normal">{b.notes}</p>, wide: true }] }] : []),
  ],
  Form: HotelForm,
  emptyDraft: () =>
    baseEmpty({ hotelId: '', hotelName: '', checkIn: '', checkOut: '', rooms: '', mealPlan: '', adults: '', children: '', bookingDate: today(), confirmationNo: '', paidToHotel: '', hotelPaidOn: '' }),
  toDraft: (b) => ({
    ...baseToDraft(b),
    hotelId: b.hotel?.id ?? '',
    hotelName: b.hotel?.name ?? '',
    checkIn: toStr(b.checkIn),
    checkOut: toStr(b.checkOut),
    rooms: toStr(b.rooms),
    mealPlan: toStr(b.mealPlan),
    adults: toStr(b.adults),
    children: toStr(b.children),
    bookingDate: toStr(b.bookingDate),
    confirmationNo: toStr(b.confirmationNo),
    paidToHotel: toStr(b.paidToHotel),
    hotelPaidOn: toStr(b.hotelPaidOn),
  }),
  toPayload: (d) => ({
    ...basePayload(d),
    hotelId: d.hotelId || null,
    // A hotel named on the sale but not picked yet is found or added by name.
    hotelName: !d.hotelId && d.hotelName ? d.hotelName : undefined,
    checkIn: d.checkIn || null,
    checkOut: d.checkOut || null,
    rooms: str(d.rooms),
    mealPlan: str(d.mealPlan),
    adults: int(d.adults),
    children: int(d.children),
    bookingDate: d.bookingDate || null,
    confirmationNo: str(d.confirmationNo),
    paidToHotel: num(d.paidToHotel),
    hotelPaidOn: d.hotelPaidOn || null,
  }),
  validate: (d, t) => {
    const errors = requireFields(d, t, ['guestName', 'checkIn', 'checkOut']);
    errors.hotelId = d.hotelId || d.hotelName ? '' : t.common.required;
    if (d.checkIn && d.checkOut && d.checkOut < d.checkIn) errors.checkOut = t.errors.CHECKOUT_BEFORE_CHECKIN;
    return errors;
  },
  fromSale: (s) =>
    baseFromSale(s, {
      hotelId: '',
      hotelName: s.hotelName ?? '',
      checkIn: toStr(s.startDate),
      checkOut: toStr(s.endDate),
      rooms: roomsText(s.singleRooms, s.doubleRooms, s.tripleRooms),
      mealPlan: '',
      adults: toStr(s.adults),
      children: toStr(s.children || ''),
      bookingDate: today(),
      confirmationNo: '',
      cost: s.hotelCost ? toStr(s.hotelCost) : '',
      sell: s.hotelSell ? toStr(s.hotelSell) : '',
      paidToHotel: '',
      hotelPaidOn: '',
    }),
};
