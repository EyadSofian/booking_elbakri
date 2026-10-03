'use client';

import { ArrowLeftRight, ArrowRight, CircleDollarSign, FilePlus2, FileSpreadsheet, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { STATUSES, type ActivityItem, type EntityType, type Status } from '@elbakri/shared';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { useI18n } from '@/lib/providers';
import { cn, formatDateTime } from '@/lib/utils';
import { StatusBadge } from './status';

function fieldLabel(t: Dictionary, key: string): string {
  const map: Record<string, string> = {
    status: t.common.status,
    guestName: t.ops.guestName,
    customerName: t.sales.customerName,
    nationality: t.common.nationality,
    phone: t.common.phone,
    agency: t.common.agency,
    hotel: t.hotels.hotel,
    hotelName: t.sales.hotel,
    checkIn: t.hotels.checkIn,
    checkOut: t.hotels.checkOut,
    rooms: t.hotels.rooms,
    mealPlan: t.hotels.mealPlan,
    adults: t.common.adults,
    children: t.common.children,
    bookingDate: t.hotels.bookingDate,
    confirmationNo: t.hotels.confirmationNo,
    currency: t.common.currency,
    cost: t.common.cost,
    sell: t.common.sell,
    paidToHotel: t.hotels.paidToHotel,
    hotelPaidOn: t.hotels.hotelPaidOn,
    notes: t.common.notes,
    kind: t.transfers.kind,
    date: t.common.date,
    time: t.transfers.pickup,
    fromPlace: t.common.from,
    toPlace: t.common.to,
    flightNo: t.transfers.flight,
    vehicle: t.transfers.vehicle,
    driverName: t.transfers.driverName,
    driverPhone: t.transfers.driverPhone,
    activity: t.excursions.activity,
    pax: t.visas.pax,
    travelDate: t.visas.travelDate,
    passportNo: t.visas.passport,
    returnDate: t.flights.returnDate,
    airline: t.flights.airline,
    ticketNo: t.flights.ticketNo,
    saleDate: t.sales.saleDate,
    destination: t.sales.destination,
    singleRooms: t.sales.single,
    doubleRooms: t.sales.double,
    tripleRooms: t.sales.triple,
    startDate: t.sales.start,
    endDate: t.sales.end,
    hotelCost: `${t.sales.lineHotel} · ${t.common.cost}`,
    hotelSell: `${t.sales.lineHotel} · ${t.common.sell}`,
    flightDetails: t.sales.flightDetails,
    flightCost: `${t.sales.lineFlight} · ${t.common.cost}`,
    flightSell: `${t.sales.lineFlight} · ${t.common.sell}`,
    flightCommission: `${t.sales.lineFlight} · ${t.sales.commission}`,
    transferDetails: t.sales.transferDetails,
    transferCost: `${t.sales.lineTransfer} · ${t.common.cost}`,
    transferSell: `${t.sales.lineTransfer} · ${t.common.sell}`,
    serviceType: t.sales.serviceType,
    serviceCost: `${t.sales.lineService} · ${t.common.cost}`,
    serviceSell: `${t.sales.lineService} · ${t.common.sell}`,
    seller: t.sales.seller,
    commissionRate: t.sales.commissionRate,
  };
  return map[key] ?? key;
}

function Value({ v, field, type }: { v: unknown; field: string; type: EntityType }) {
  const { t } = useI18n();
  if (v === null || v === undefined || v === '') return <span className="text-muted-foreground/60">—</span>;
  if (field === 'status' && STATUSES.includes(v as Status)) return <StatusBadge status={v as Status} type={type} />;
  if (field === 'kind' && typeof v === 'string') return <span>{t.transferKind[v as keyof typeof t.transferKind] ?? v}</span>;
  return <span className="break-words">{String(v)}</span>;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: FilePlus2,
  IMPORTED: FileSpreadsheet,
  UPDATED: Pencil,
  STATUS: ArrowLeftRight,
  DELETED: Trash2,
  PAYMENT_ADDED: CircleDollarSign,
  PAYMENT_REMOVED: CircleDollarSign,
  FILE_ADDED: Paperclip,
  FILE_REMOVED: Paperclip,
};

/** Who did what and when, newest first. */
export function ActivityList({ items, type, loading }: { items: ActivityItem[] | undefined; type: EntityType; loading?: boolean }) {
  const { t, locale } = useI18n();
  const verbs: Record<string, string> =
    locale === 'ar'
      ? { CREATED: 'سجّل الحجز', IMPORTED: 'اتستورد من الشيت', UPDATED: 'عدّل', STATUS: 'غيّر الحالة', DELETED: 'مسح', PAYMENT_ADDED: 'سجّل دفعة', PAYMENT_REMOVED: 'مسح دفعة', FILE_ADDED: 'رفع ملف', FILE_REMOVED: 'شال ملف' }
      : { CREATED: 'created this', IMPORTED: 'imported from the sheet', UPDATED: 'edited', STATUS: 'changed the status', DELETED: 'deleted', PAYMENT_ADDED: 'recorded a payment', PAYMENT_REMOVED: 'removed a payment', FILE_ADDED: 'uploaded a file', FILE_REMOVED: 'removed a file' };

  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-surface-sunken" />;
  if (!items?.length) return <p className="text-sm text-muted-foreground">{t.common.noHistory}</p>;

  return (
    <ol className="relative space-y-4 before:absolute before:inset-y-1 before:start-[11px] before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = ICONS[a.action] ?? Pencil;
        const changes = Object.entries(a.changes ?? {}).filter(([k]) => k !== 'status' || a.action !== 'STATUS');
        return (
          <li key={a.id} className="relative flex gap-3">
            <span
              className={cn(
                'relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-surface text-muted-foreground',
                a.action === 'STATUS' && 'text-primary',
                a.action.startsWith('PAYMENT') && 'text-success',
              )}
            >
              <Icon className="size-3" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5 text-sm">
              <p>
                <span className="font-medium">{a.user?.name ?? (a.action === 'IMPORTED' ? 'Excel' : '—')}</span>{' '}
                <span className="text-muted-foreground">{verbs[a.action] ?? a.action}</span>
                {a.action === 'STATUS' && a.changes?.status ? (
                  <span className="ms-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
                    <Value v={a.changes.status.from} field="status" type={type} />
                    <ArrowRight className="flip-rtl size-3 text-muted-foreground" aria-hidden />
                    <Value v={a.changes.status.to} field="status" type={type} />
                  </span>
                ) : null}
              </p>
              {a.summary && a.action !== 'STATUS' ? <p className="ltr text-xs text-muted-foreground">{a.summary}</p> : null}
              {changes.length ? (
                <dl className="mt-1.5 space-y-1 rounded-md bg-surface-muted px-2.5 py-2 text-xs">
                  {changes.map(([field, change]) => (
                    <div key={field} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-2">
                      <dt className="text-muted-foreground">{fieldLabel(t, field)}</dt>
                      <dd className="flex flex-wrap items-center gap-1.5">
                        <span className="line-through decoration-muted-foreground/50 opacity-70">
                          <Value v={change.from} field={field} type={type} />
                        </span>
                        <ArrowRight className="flip-rtl size-3 shrink-0 text-muted-foreground" aria-hidden />
                        <Value v={change.to} field={field} type={type} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="mt-1 text-[0.7rem] text-muted-foreground">{formatDateTime(a.createdAt, locale)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
