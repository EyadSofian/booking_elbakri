/**
 * The business model, shared by the API and the web app so both sides agree on
 * the same names, values and shapes.
 *
 * There are two ways a booking enters the system:
 *   - Sales record a customer booking with its prices (the sales sheet).
 *   - Operations record and run the services themselves: hotels, transfers,
 *     excursions and visas (the operations sheets).
 * A sale can ask operations for a service; the service keeps a link back to it.
 */

export const ROLES = ['ADMIN', 'SALES', 'OPERATIONS'] as const;
export type Role = (typeof ROLES)[number];

/**
 * One status list for every booking type, so a person learns it once.
 * Any status can move to any other — the history records who changed what.
 */
export const STATUSES = ['NEW', 'IN_PROGRESS', 'CONFIRMED', 'DONE', 'CANCELLED'] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses that still need someone to act. */
export const OPEN_STATUSES: readonly Status[] = ['NEW', 'IN_PROGRESS'];

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const TRANSFER_KINDS = ['ARRIVAL', 'DEPARTURE', 'TRANSFER'] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

/** What a sale line can be; a sale holds any number of each. */
export const SALE_LINE_KINDS = ['HOTEL', 'FLIGHT', 'TRANSFER', 'SERVICE'] as const;
export type SaleLineKind = (typeof SALE_LINE_KINDS)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'INSTAPAY', 'OTHER'] as const;
export type SalePaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ENTITY_TYPES = ['SALE', 'HOTEL', 'TRANSFER', 'EXCURSION', 'VISA'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Short prefix shown before a record number, e.g. H-120. */
export const REF_PREFIX: Record<EntityType, string> = {
  SALE: 'S',
  HOTEL: 'H',
  TRANSFER: 'T',
  EXCURSION: 'X',
  VISA: 'V',
};

export function formatRef(type: EntityType, number: number | null | undefined): string {
  return number == null ? '' : `${REF_PREFIX[type]}-${number}`;
}

/** Nights between two YYYY-MM-DD dates; null when either is missing or reversed. */
export function countNights(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Sale arithmetic — the formulas of the sales sheet (شيت حجوزات), in one place.
// ---------------------------------------------------------------------------

export interface SalePricing {
  hotelCost: number;
  hotelSell: number;
  flightCost: number;
  flightSell: number;
  /** Paid out on the ticket; counts as a cost (sheet: عمولة الطيران). */
  flightCommission: number;
  transferCost: number;
  transferSell: number;
  serviceCost: number;
  serviceSell: number;
  /** Seller commission as a percentage of total profit (sheet: 10%). */
  commissionRate: number;
  paid: number;
}

export interface SaleTotals {
  hotelProfit: number;
  flightProfit: number;
  transferProfit: number;
  serviceProfit: number;
  totalCost: number;
  totalSell: number;
  totalProfit: number;
  commission: number;
  /** What the customer owes in total — equal to the total sell. */
  customerTotal: number;
  paid: number;
  remaining: number;
}

/**
 * Mirrors the sheet exactly:
 *   ربح الطيران  = بيع − تكلفة − عمولة الطيران
 *   اجمالي تكلفة = فندق + طيران + عمولة الطيران + انتقالات + خدمة
 *   اجمالي بيع   = فندق + طيران + انتقالات + خدمة
 *   العمولة      = اجمالي ربح × النسبة
 *   الباقي       = اجمالي المبلغ − المدفوع
 */
export function computeSaleTotals(p: Partial<SalePricing>): SaleTotals {
  const n = (v: number | undefined) => (Number.isFinite(v) ? Number(v) : 0);
  const hotelCost = n(p.hotelCost);
  const hotelSell = n(p.hotelSell);
  const flightCost = n(p.flightCost);
  const flightSell = n(p.flightSell);
  const flightCommission = n(p.flightCommission);
  const transferCost = n(p.transferCost);
  const transferSell = n(p.transferSell);
  const serviceCost = n(p.serviceCost);
  const serviceSell = n(p.serviceSell);
  const rate = p.commissionRate == null ? 10 : n(p.commissionRate);
  const paid = n(p.paid);

  const totalCost = round2(hotelCost + flightCost + flightCommission + transferCost + serviceCost);
  const totalSell = round2(hotelSell + flightSell + transferSell + serviceSell);
  const totalProfit = round2(totalSell - totalCost);

  return {
    hotelProfit: round2(hotelSell - hotelCost),
    flightProfit: round2(flightSell - flightCost - flightCommission),
    transferProfit: round2(transferSell - transferCost),
    serviceProfit: round2(serviceSell - serviceCost),
    totalCost,
    totalSell,
    totalProfit,
    // No commission is earned on a loss.
    commission: round2(Math.max(totalProfit, 0) * (rate / 100)),
    customerTotal: totalSell,
    paid: round2(paid),
    remaining: round2(totalSell - paid),
  };
}

/** One thing sold on a sale, as entered: the money parts of a line. */
export interface SaleLineMoney {
  kind: SaleLineKind;
  cost: number;
  sell: number;
  /** Flights only: paid out on the ticket, counted as a cost. */
  commission: number;
}

/** A line's profit: sell − cost − commission (the commission only applies to flights). */
export function saleLineProfit(l: SaleLineMoney): number {
  return round2(l.sell - l.cost - (l.kind === 'FLIGHT' ? l.commission : 0));
}

/** Adds the lines up per kind into the sheet's columns, ready for computeSaleTotals. */
export function pricingFromLines(lines: SaleLineMoney[], commissionRate: number, paid: number): SalePricing {
  const sum = (kind: SaleLineKind, pick: (l: SaleLineMoney) => number) =>
    round2(lines.filter((l) => l.kind === kind).reduce((total, l) => total + (Number.isFinite(pick(l)) ? pick(l) : 0), 0));
  return {
    hotelCost: sum('HOTEL', (l) => l.cost),
    hotelSell: sum('HOTEL', (l) => l.sell),
    flightCost: sum('FLIGHT', (l) => l.cost),
    flightSell: sum('FLIGHT', (l) => l.sell),
    flightCommission: sum('FLIGHT', (l) => l.commission),
    transferCost: sum('TRANSFER', (l) => l.cost),
    transferSell: sum('TRANSFER', (l) => l.sell),
    serviceCost: sum('SERVICE', (l) => l.cost),
    serviceSell: sum('SERVICE', (l) => l.sell),
    commissionRate,
    paid,
  };
}

/** Builds the rooms line ("1 SGL + 2 DBL") from room counts. */
export function roomsText(single: number, double: number, triple: number): string {
  const parts: string[] = [];
  if (single > 0) parts.push(`${single} SGL`);
  if (double > 0) parts.push(`${double} DBL`);
  if (triple > 0) parts.push(`${triple} TRPL`);
  return parts.join(' + ');
}

// ---------------------------------------------------------------------------
// Shapes returned by the API. The web app types its screens against these, so
// a page cannot be written against fields the server never sends.
// ---------------------------------------------------------------------------

export interface NamedRef {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** A sales supervisor: sees every salesperson's sales, not only their own. */
  seesAllSales: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AgencyItem {
  id: string;
  name: string;
  isDirect: boolean;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  bookings: number;
}

export interface HotelItem {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
  bookings: number;
}

/** Fields every operations booking carries. */
export interface OpsBase {
  id: string;
  number: number;
  ref: string;
  status: Status;
  guestName: string;
  nationality: string | null;
  phone: string | null;
  agency: NamedRef | null;
  currency: CurrencyCode;
  cost: number | null;
  sell: number | null;
  notes: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface HotelBookingItem extends OpsBase {
  hotel: (NamedRef & { city: string | null }) | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  rooms: string | null;
  mealPlan: string | null;
  adults: number | null;
  children: number | null;
  bookingDate: string | null;
  confirmationNo: string | null;
  paidToHotel: number | null;
  /** The day the hotel must be paid (when a balance is left). */
  hotelPaidOn: string | null;
}

/** What is still owed to the hotel; null when no cost is recorded. */
export function hotelOwed(b: Pick<HotelBookingItem, 'cost' | 'paidToHotel'>): number | null {
  if (b.cost == null) return null;
  return round2(b.cost - (b.paidToHotel ?? 0));
}

/** When the hotel should be paid: the payment date, or the check-in when none is set. */
export function hotelPaymentDue(b: Pick<HotelBookingItem, 'hotelPaidOn' | 'checkIn'>): string | null {
  return b.hotelPaidOn ?? b.checkIn;
}

export interface TransferItem extends OpsBase {
  kind: TransferKind;
  date: string | null;
  time: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  flightNo: string | null;
  adults: number | null;
  children: number | null;
  vehicle: string | null;
  driverName: string | null;
  driverPhone: string | null;
}

export interface ExcursionItem extends OpsBase {
  activity: string;
  hotelName: string | null;
  date: string | null;
  time: string | null;
  adults: number | null;
  children: number | null;
}

export interface VisaItem extends OpsBase {
  pax: number;
  fromPlace: string | null;
  toPlace: string | null;
  travelDate: string | null;
  passportNo: string | null;
}

export interface SalePaymentItem {
  id: string;
  amount: number;
  paidOn: string;
  method: SalePaymentMethod | null;
  note: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
}

export interface SaleLineItem extends SaleLineMoney {
  id: string;
  /** The hotel name, flight details, transfer route or service type. */
  title: string | null;
  /** Check-in for a hotel; the day of a flight, transfer or service. */
  startDate: string | null;
  /** Check-out for a hotel. */
  endDate: string | null;
  nights: number | null;
  singleRooms: number;
  doubleRooms: number;
  tripleRooms: number;
  profit: number;
}

/**
 * A sale. The per-kind money (hotelCost…), the room counts and the hotel,
 * flight, transfer and service texts are its lines added up, so lists and the
 * Excel export still read one row per sale.
 */
export interface SaleItem extends SalePricing, SaleTotals {
  id: string;
  number: number;
  ref: string;
  status: Status;
  /** YYYY-MM-DD — the day the sale was made. */
  saleDate: string;
  customerName: string;
  nationality: string | null;
  phone: string | null;
  destination: string | null;
  hotelName: string | null;
  adults: number;
  children: number;
  singleRooms: number;
  doubleRooms: number;
  tripleRooms: number;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  currency: CurrencyCode;
  flightDetails: string | null;
  transferDetails: string | null;
  serviceType: string | null;
  seller: NamedRef | null;
  lastPaymentOn: string | null;
  notes: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
  lines: SaleLineItem[];
  /** False for a sales supervisor looking at someone else's sale: they can read it, not change it. */
  canEdit: boolean;
}

export interface SaleDetail extends SaleItem {
  payments: SalePaymentItem[];
}

export interface ActivityItem {
  id: string;
  action: string;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  user: NamedRef | null;
  createdAt: string;
}

/** Count of records per status, for the status tabs above every list. */
export type StatusCounts = Record<Status | 'ALL', number>;

export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  counts: StatusCounts;
  /** Counts for tabs beyond the statuses, e.g. hotel payments due. */
  extraCounts?: Record<string, number>;
}

export interface MoneyByCurrency {
  currency: CurrencyCode;
  amount: number;
}

export interface DashboardData {
  date: string;
  /** The day the lists below describe (today or tomorrow). */
  day: string;
  counts: {
    checkIns: number;
    checkOuts: number;
    transfers: number;
    excursions: number;
    openRequests: number;
    unassignedTransfers: number;
  };
  openByType: Record<'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA' | 'SALE', number>;
  checkIns: HotelBookingItem[];
  checkOuts: HotelBookingItem[];
  transfers: TransferItem[];
  excursions: ExcursionItem[];
  requests: Array<{
    type: EntityType;
    id: string;
    ref: string;
    status: Status;
    title: string;
    subtitle: string | null;
    date: string | null;
    createdAt: string;
  }>;
  /** Hotels still owed money, due within the week or already late. */
  payments: {
    overdue: number;
    today: number;
    tomorrow: number;
    items: HotelBookingItem[];
  };
}
