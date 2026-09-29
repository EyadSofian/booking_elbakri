import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import {
  cleanDisplay, isEmptyMarker, parseLegacyCount, parseLegacyDate, parseLegacyMoney, parseLegacyPhone, parseLegacyTime,
  type CurrencyCode,
} from '@elbakri/shared';

/**
 * Reads the ELBAKRI workbooks as the team actually keeps them:
 *   - a title row, then a header row (NAME, CHECK IN, HOTEL…), then data;
 *   - one booking per row, often spread over merged cells;
 *   - a row with a blank NAME continues the guest above it (their second
 *     hotel, their return transfer, their next excursion);
 *   - the same agency or meal plan typed a dozen ways.
 * Everything here is pure: workbook bytes in, clean records out.
 */

export type SheetKind = 'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA' | 'PAYMENT' | 'SALES';

export interface HotelRecord {
  kind: 'HOTEL';
  row: number;
  guestName: string;
  nationality: string | null;
  phone: string | null;
  checkIn: string | null;
  checkOut: string | null;
  hotel: string | null;
  rooms: string | null;
  mealPlan: string | null;
  bookingDate: string | null;
  agency: string | null;
  notes: string | null;
}

export interface TransferRecord {
  kind: 'TRANSFER';
  row: number;
  guestName: string;
  phone: string | null;
  nationality: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  adults: number | null;
  children: number | null;
  date: string | null;
  flightNo: string | null;
  time: string | null;
  agency: string | null;
  notes: string | null;
}

export interface ExcursionRecord {
  kind: 'EXCURSION';
  row: number;
  guestName: string;
  phone: string | null;
  nationality: string | null;
  hotelName: string | null;
  activity: string;
  date: string | null;
  adults: number | null;
  children: number | null;
  agency: string | null;
  notes: string | null;
}

export interface VisaRecord {
  kind: 'VISA';
  row: number;
  guestName: string;
  phone: string | null;
  nationality: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  pax: number;
  travelDate: string | null;
  agency: string | null;
  cost: number | null;
  sell: number | null;
  notes: string | null;
}

export interface PaymentRecord {
  kind: 'PAYMENT';
  row: number;
  hotel: string;
  checkIn: string | null;
  total: number | null;
  paid: number | null;
  paidOn: string | null;
  currency: CurrencyCode | null;
  raw: string;
}

export interface SalesRecord {
  kind: 'SALES';
  row: number;
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
  paymentDate: string | null;
  hotelCost: number;
  hotelSell: number;
  flightCost: number;
  flightSell: number;
  flightCommission: number;
  transferDetails: string | null;
  transferCost: number;
  transferSell: number;
  serviceType: string | null;
  serviceCost: number;
  serviceSell: number;
  seller: string | null;
  paid: number;
}

export type ImportRecord = HotelRecord | TransferRecord | ExcursionRecord | VisaRecord | PaymentRecord | SalesRecord;

export interface ParsedSheet {
  name: string;
  kind: SheetKind | null;
  headerRow: number | null;
  records: ImportRecord[];
  /** Rows that could not become a record, with the reason. */
  skipped: Array<{ row: number; reason: string }>;
}

// ---------------------------------------------------------------------------
// Reading cells
// ---------------------------------------------------------------------------

type Grid = unknown[][];

function cellValue(cell: ExcelJS.Cell): unknown {
  // A merged range repeats the master's value in every cell; only the master
  // (top-left) cell carries it, or one booking would read as two.
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) return null;
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result instanceof Date || typeof o.result !== 'object' ? o.result ?? null : null;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((r) => r.text).join('');
    if ('text' in o) return o.text;
    if ('error' in o) return null;
    return null;
  }
  return v;
}

async function readGrids(buffer: Buffer): Promise<Array<{ name: string; grid: Grid }>> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types predate generic Buffers.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook.worksheets.map((ws) => {
    const grid: Grid = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellValue(cell);
      });
      grid[rowNumber - 1] = cells;
    });
    return { name: ws.name, grid };
  });
}

// ---------------------------------------------------------------------------
// Recognising a sheet by its header row
// ---------------------------------------------------------------------------

const norm = (v: unknown) =>
  String(v ?? '')
    // Tatweel and harakat, then the alef / taa marbuta / alef maqsura variants.
    .replace(/\u0640/g, '')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Header text → field, per sheet kind. Keys are normalised header texts. */
const HEADERS: Record<SheetKind, Record<string, string>> = {
  HOTEL: {
    NAME: 'name', NATIONALITY: 'nationality', PHONE: 'phone', 'CHECK IN': 'checkIn', 'CHECK OUT': 'checkOut',
    HOTEL: 'hotel', 'TYPE ROOM': 'rooms', 'ROOM TYPE': 'rooms', 'MEAL PLAN': 'mealPlan', 'BOOKING DATE': 'bookingDate',
    'TRAVEL AGENCY': 'agency',
  },
  TRANSFER: {
    NAME: 'name', PHONE: 'phone', FROM: 'from', TO: 'to', PAXS: 'pax', PAX: 'pax', NATIONALITY: 'nationality',
    DATE: 'date', 'FLIGHT NUMBER': 'flight', FLIGHT: 'flight', PICKUP: 'time', 'PICK UP': 'time', 'TRAVEL AGENCY': 'agency',
  },
  VISA: {
    NAME: 'name', PHONE: 'phone', FROM: 'from', TO: 'to', PAXS: 'pax', PAX: 'pax', NATIONALITY: 'nationality',
    DATE: 'date', 'TRAVEL AGENCY': 'agency', NET: 'net', SELL: 'sell',
  },
  EXCURSION: {
    NAME: 'name', PAXS: 'pax', PAX: 'pax', CHILD: 'child', PHONE: 'phone', NATIONALITY: 'nationality', HOTEL: 'hotel',
    EX: 'activity', EXCURSION: 'activity', DATE: 'date', REST: 'rest', 'TRAVEL AGENCY': 'agency',
  },
  PAYMENT: {
    'HOTEL NAME': 'hotel', 'TOTAL PAYMENT': 'total', PAID: 'paid', REST: 'rest', 'DATE OF PAYMENT': 'paidOn',
    'CHECK IN': 'checkIn', 'CHECK OUT': 'status',
  },
  SALES: {
    [norm('الاسم')]: 'name', [norm('الجنسية')]: 'nationality', [norm('رقم الموبايل')]: 'phone', [norm('الرحلة')]: 'destination',
    [norm('الفندق')]: 'hotel', [norm('بالغ')]: 'adults', [norm('طفل')]: 'children', [norm('سنجل')]: 'single',
    [norm('دبل')]: 'double', [norm('تربل')]: 'triple', [norm('من')]: 'from', [norm('الي')]: 'to',
    [norm('تاريخ الدفع')]: 'paymentDate', [norm('تكلفةا لفندق')]: 'hotelCost', [norm('تكلفة الفندق')]: 'hotelCost',
    [norm('بيع الفندق')]: 'hotelSell', [norm('تكلفة الطيران')]: 'flightCost', [norm('بيع الطيران')]: 'flightSell',
    [norm('عمولة الطيران')]: 'flightCommission', [norm('الانتقالات')]: 'transfer', [norm('تكلفة الانتقالات')]: 'transferCost',
    [norm('بيع الانتقالات')]: 'transferSell', [norm('نوع الخدمة')]: 'serviceType', [norm('تكلفة الخدمة')]: 'serviceCost',
    [norm('بيع الخدمة')]: 'serviceSell', [norm('البائع')]: 'seller', [norm('المدفوع')]: 'paid',
  },
};

function detect(grid: Grid): { kind: SheetKind; headerRow: number; columns: Map<number, string> } | null {
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const texts = (grid[r] ?? []).map(norm);
    const has = (...t: string[]) => t.every((x) => texts.includes(x));
    let kind: SheetKind | null = null;
    if (has('HOTEL NAME', 'TOTAL PAYMENT')) kind = 'PAYMENT';
    else if (has('NAME', 'CHECK IN', 'CHECK OUT')) kind = 'HOTEL';
    else if (has('NAME', 'FROM', 'TO') && (has('PICKUP') || has('FLIGHT NUMBER'))) kind = 'TRANSFER';
    else if (has('NAME', 'FROM', 'TO') && (has('NET') || has('SELL'))) kind = 'VISA';
    else if (has('NAME', 'EX') || has('NAME', 'EXCURSION')) kind = 'EXCURSION';
    else if (has(norm('الاسم')) && (has(norm('بيع الفندق')) || has(norm('اجمالي بيع')))) kind = 'SALES';
    if (!kind) continue;

    const columns = new Map<number, string>();
    texts.forEach((text, col) => {
      const field = HEADERS[kind!][text];
      if (field && ![...columns.values()].includes(field)) columns.set(col, field);
    });
    return { kind, headerRow: r, columns };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Value clean-up
// ---------------------------------------------------------------------------

const text = (v: unknown): string | null => {
  const s = cleanDisplay(v instanceof Date ? v.toISOString().slice(0, 10) : v);
  return s === null || isEmptyMarker(s) ? null : s;
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function date(v: unknown, assumeYear?: number): { value: string | null; raw: string | null } {
  if (v === null || v === undefined || v === '') return { value: null, raw: null };
  const parsed = parseLegacyDate(v, { assumeYear });
  const year = parsed.value?.getUTCFullYear();
  // A year far from today is a typo, not a booking.
  if (parsed.value && year !== undefined && (year < 2020 || year > 2035)) return { value: null, raw: String(v) };
  return { value: iso(parsed.value), raw: parsed.value ? null : text(v) };
}

/**
 * The year to assume for dates typed without one ("22 يوليو"): the year of the
 * first real date in the sheet, since the sheets run in date order.
 */
function firstYear(rows: Ctx['rows'], get: Ctx['get'], fields: string[]): number {
  for (const { cells } of rows) {
    for (const f of fields) {
      const v = get(cells, f);
      if (v instanceof Date) return v.getUTCFullYear();
    }
  }
  return new Date().getUTCFullYear();
}

function shiftYear(d: string, years: number): string {
  return `${Number(d.slice(0, 4)) + years}${d.slice(4)}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function phone(v: unknown): string | null {
  const p = parseLegacyPhone(v);
  if (p.normalized) return p.normalized;
  return p.digits ?? text(v);
}

const AGENCIES: Array<[RegExp, string]> = [
  [/^(el\s*-?\s*bakr|elbkri|al\s*bakri|albakri|البكر)/i, 'ELBAKRI OVERSEAS'],
  [/^sama\b|^sam$/i, 'SAMA TOURS'],
  [/^ta[sz]?k(a)?r(a|ta|ah)?\b/i, 'TAZKARA'],
  [/^y[ae]?l+o+w/i, 'YELLOW'],
  [/^sky/i, 'SKY TOURS'],
  [/^dis\s*cover/i, 'DISCOVERY'],
  [/^free(dom)?$/i, 'FREEDOM'],
  [/^transfer$/i, 'TRANSFER'],
  [/^blue\s*wing/i, 'BLUE WINGS'],
  [/^fayad/i, 'FAYAD'],
  [/^hi\s*speed/i, 'HISPEED'],
  [/^t[üu]rkmen/i, 'TÜRKMEN LIFE'],
  [/^sofina/i, 'SOFINA'],
];

export const DIRECT_AGENCY = 'ELBAKRI OVERSEAS';

export function agency(v: unknown): string | null {
  const s = text(v);
  if (!s || /^(no|non|none|\.|-)$/i.test(s)) return null;
  for (const [re, name] of AGENCIES) if (re.test(s)) return name;
  return /[a-z]/i.test(s) ? s.toUpperCase() : s;
}

const NATIONALITIES: Array<[RegExp, string]> = [
  [/^(egy|egypt|eg$|egyt|مصر)/i, 'Egyptian'],
  [/^(leb|لبنان)/i, 'Lebanese'],
  [/^(alg|alag|الجزائر)/i, 'Algerian'],
  [/^saud/i, 'Saudi'],
  [/^iraq/i, 'Iraqi'],
  [/^(yam|yem)/i, 'Yemeni'],
  [/^mor+oc+o/i, 'Moroccan'],
  [/^jord/i, 'Jordanian'],
  [/^liby/i, 'Libyan'],
  [/^pal/i, 'Palestinian'],
  [/^turk/i, 'Turkish'],
  [/^chin/i, 'Chinese'],
  [/^(france|french|franch)/i, 'French'],
  [/^ital/i, 'Italian'],
  [/^emir/i, 'Emirati'],
  [/^dominic/i, 'Dominican'],
  [/^armen/i, 'Armenian'],
];

export function nationality(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  // Only a single word is safe to standardise; "1 Algerian + 1 French" stays as typed.
  if (/^[\p{L}.]+$/u.test(s)) for (const [re, name] of NATIONALITIES) if (re.test(s)) return name;
  return s;
}

const MEAL_PLANS: Array<[RegExp, string]> = [
  [/ultra|الترا/i, 'Ultra All Inclusive'],
  [/سوفت/, 'Soft All Inclusive'],
  [/انكلوسيف|انكلوزيف|شامل/, 'All Inclusive'],
  [/نصف|هاف/, 'Half Board'],
  [/فول بورد|كامل/, 'Full Board'],
  [/افطار|فطار/, 'Bed & Breakfast'],
  [/^(soft|sai$|sal$|sai\b)/i, 'Soft All Inclusive'],
  [/^(all|al$|ai$)/i, 'All Inclusive'],
  [/^(half|hb$|h\s*,?\s*b$)/i, 'Half Board'],
  [/^(full|fb$)/i, 'Full Board'],
  [/^(bb$|b\s*[.>]\s*b|bed\s*(and|&)\s*breakfast|breakfast|bo$)/i, 'Bed & Breakfast'],
  [/^(bed only|room only|ro$)/i, 'Room Only'],
];

export function mealPlan(v: unknown): string | null {
  const s = text(v)?.replace(/\u0640/g, '') ?? null;
  if (!s) return null;
  for (const [re, name] of MEAL_PLANS) if (re.test(s)) return name;
  return s;
}

/** "Rixos  radamis " and "RIXOS RADAMIS" are the same hotel. */
export function hotelKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function tidyName(s: string): string {
  // Tatweel (ـ) stretches Arabic letters for looks; it is not part of the name.
  const t = s.replace(/\u0640/g, '').replace(/\$+/g, '').replace(/\s+/g, ' ').trim();
  // All-lower or ALL-UPPER Latin reads better in title case; mixed case was deliberate.
  if (/[a-z]/i.test(t) && (t === t.toLowerCase() || t === t.toUpperCase())) {
    return t.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
  }
  return t;
}

/** "2 + 1 CH", "4 Adult + 2 CH", "3 with child", 8 → adults/children. */
export function pax(v: unknown): { adults: number | null; children: number | null; note: string | null } {
  if (v === null || v === undefined || v === '') return { adults: null, children: null, note: null };
  if (typeof v === 'number') {
    const c = parseLegacyCount(v);
    return { adults: c.value, children: null, note: null };
  }
  const s = String(v).trim();
  const pair = s.match(/(\d+)\s*(?:adults?|adlut|adult|ad)?\s*(?:\+|&|and|\s)\s*(\d+)\s*(?:ch|chd|child|children|kids?)/i);
  if (pair) return { adults: Number(pair[1]), children: Number(pair[2]), note: null };
  const first = s.match(/\d+/);
  const adults = first ? Number(first[0]) : null;
  const plain = /^\d+(\.0+)?\s*(adults?)?$/i.test(s);
  return { adults: adults !== null && adults <= 999 ? adults : null, children: null, note: plain ? null : s };
}

function count(v: unknown): number | null {
  const c = parseLegacyCount(v);
  return c.value;
}

function amount(v: unknown): number | null {
  const m = parseLegacyMoney(v);
  return m.amount;
}

/** "82.875 le" is 82,875 pounds: in Egypt a dot often groups thousands. */
function money(v: unknown): ReturnType<typeof parseLegacyMoney> {
  const m = parseLegacyMoney(v);
  if (typeof v === 'string' && /^\s*\d{1,3}\.\d{3}\s*(le|l\.e|eg|egp|جنيه)\b/i.test(v) && m.amount !== null) {
    return { ...m, amount: Math.round(m.amount * 1000) };
  }
  return m;
}

function extraNotes(cells: unknown[], used: Set<number>, from: number): string | null {
  const parts: string[] = [];
  cells.forEach((c, i) => {
    if (i < from || used.has(i)) return;
    const s = text(c);
    if (s && !/^[;.,]+$/.test(s)) parts.push(s);
  });
  return parts.length ? parts.join(' · ') : null;
}

const joinNotes = (...parts: Array<string | null | undefined>) => {
  const s = parts.filter(Boolean).join(' · ');
  return s || null;
};

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export async function parseWorkbook(buffer: Buffer): Promise<ParsedSheet[]> {
  const grids = await readGrids(buffer);
  return grids.map(({ name, grid }) => {
    const found = detect(grid);
    if (!found) return { name, kind: null, headerRow: null, records: [], skipped: [] };
    const { kind, headerRow, columns } = found;
    const field = new Map([...columns.entries()].map(([col, f]) => [f, col]));
    const used = new Set(columns.keys());
    const lastMapped = Math.max(...columns.keys());
    const get = (cells: unknown[], f: string) => {
      const col = field.get(f);
      return col === undefined ? null : cells[col] ?? null;
    };
    const rows = grid
      .map((cells, i) => ({ row: i + 1, cells: cells ?? [] }))
      .slice(headerRow + 1)
      .filter(({ cells }) => cells.some((c) => text(c) !== null));

    const out: ParsedSheet = { name, kind, headerRow: headerRow + 1, records: [], skipped: [] };
    const ctx = { get, rows, out, extra: (cells: unknown[]) => extraNotes(cells, used, lastMapped + 1) };
    switch (kind) {
      case 'HOTEL': hotelSheet(ctx); break;
      case 'TRANSFER': transferSheet(ctx); break;
      case 'EXCURSION': excursionSheet(ctx); break;
      case 'VISA': visaSheet(ctx); break;
      case 'PAYMENT': paymentSheet(ctx); break;
      case 'SALES': salesSheet(ctx); break;
    }
    return out;
  });
}

interface Ctx {
  get: (cells: unknown[], field: string) => unknown;
  rows: Array<{ row: number; cells: unknown[] }>;
  out: ParsedSheet;
  extra: (cells: unknown[]) => string | null;
}

/** A row whose only content is a label such as "new 2026". */
function isSectionRow(cells: unknown[], nameValue: unknown): boolean {
  const filled = cells.filter((c) => text(c) !== null).length;
  return filled === 1 && text(nameValue) !== null && /\b(19|20)\d{2}\b|^new\b/i.test(String(nameValue));
}

function hotelSheet({ get, rows, out, extra }: Ctx) {
  let guest: Pick<HotelRecord, 'guestName' | 'nationality' | 'phone' | 'agency' | 'bookingDate'> | null = null;
  let year = firstYear(rows, get, ['checkIn', 'checkOut', 'bookingDate']);
  for (const { row, cells } of rows) {
    const name = text(get(cells, 'name'));
    if (isSectionRow(cells, get(cells, 'name'))) continue;
    const hotel = text(get(cells, 'hotel'));
    const checkIn = date(get(cells, 'checkIn'), year);
    const checkOut = date(get(cells, 'checkOut'), year);
    if (!name && !guest) {
      out.skipped.push({ row, reason: 'No guest name and no guest above it' });
      continue;
    }
    if (!hotel && !checkIn.value && !checkOut.value && !name) {
      out.skipped.push({ row, reason: 'Nothing to book on this row' });
      continue;
    }
    if (name) {
      guest = {
        guestName: tidyName(name),
        nationality: nationality(get(cells, 'nationality')),
        phone: phone(get(cells, 'phone')),
        agency: agency(get(cells, 'agency')),
        bookingDate: date(get(cells, 'bookingDate'), year).value,
      };
    }
    const inDate = checkIn.value;
    let outDate = checkOut.value;
    const notes: Array<string | null> = [extra(cells)];
    if (inDate) year = Number(inDate.slice(0, 4));
    // "29 Dec → 2 Jan" typed with last year's date on the check-out.
    if (inDate && outDate && outDate < inDate) {
      const nextYear = shiftYear(outDate, 1);
      const nights = daysBetween(inDate, nextYear);
      if (nights >= 0 && nights <= 60) outDate = nextYear;
    }
    if (inDate && outDate && outDate < inDate) {
      notes.push(`Check-out in sheet: ${outDate}`);
      outDate = null;
    }
    if (checkIn.raw) notes.push(`Check-in in sheet: ${checkIn.raw}`);
    if (checkOut.raw) notes.push(`Check-out in sheet: ${checkOut.raw}`);
    let bookingDate = (name ? guest!.bookingDate : date(get(cells, 'bookingDate'), year).value) ?? guest!.bookingDate;
    if (bookingDate && inDate && daysBetween(inDate, bookingDate) > 7 && shiftYear(bookingDate, -1) <= inDate) {
      bookingDate = shiftYear(bookingDate, -1);
    }
    // A row under the guest with no hotel of its own is more rooms or nights
    // at the hotel above it.
    const previous = !name ? (out.records[out.records.length - 1] as HotelRecord | undefined) : undefined;
    const sameHotel = !hotel && previous?.guestName === guest!.guestName ? previous : undefined;

    out.records.push({
      kind: 'HOTEL',
      row,
      guestName: guest!.guestName,
      nationality: guest!.nationality,
      phone: guest!.phone,
      checkIn: inDate,
      checkOut: outDate,
      hotel: hotel ? tidyName(hotel) : sameHotel?.hotel ?? null,
      rooms: text(get(cells, 'rooms')),
      mealPlan: mealPlan(get(cells, 'mealPlan')) ?? sameHotel?.mealPlan ?? null,
      bookingDate,
      agency: guest!.agency,
      notes: joinNotes(...notes),
    });
  }
}

const FLIGHT = /^[A-Z0-9]{2}\s?-?\d{2,4}[A-Z]?$/i;

function transferSheet({ get, rows, out, extra }: Ctx) {
  let guest: Pick<TransferRecord, 'guestName' | 'phone' | 'nationality' | 'agency' | 'adults' | 'children'> | null = null;
  let year = firstYear(rows, get, ['date']);
  for (const { row, cells } of rows) {
    const name = text(get(cells, 'name'));
    if (isSectionRow(cells, get(cells, 'name'))) continue;
    const from = text(get(cells, 'from'));
    const to = text(get(cells, 'to'));
    let flightCell = get(cells, 'flight');
    let timeCell = get(cells, 'time');
    // Some rows have the pickup time and flight number typed in each other's column.
    if (timeCell && typeof timeCell === 'string' && FLIGHT.test(timeCell.trim()) && (flightCell instanceof Date || typeof flightCell === 'number')) {
      [flightCell, timeCell] = [timeCell, flightCell];
    }
    const when = date(get(cells, 'date'), year);
    if (!name && !guest) {
      out.skipped.push({ row, reason: 'No guest name and no guest above it' });
      continue;
    }
    if (!from && !to && !when.value && !name) {
      const onlyTime = parseLegacyTime(timeCell);
      if (onlyTime.value && out.records.length) {
        // A lone time under a journey is that journey's pickup time.
        const last = out.records[out.records.length - 1] as TransferRecord;
        if (!last.time) last.time = onlyTime.value;
        continue;
      }
      out.skipped.push({ row, reason: 'Nothing to book on this row' });
      continue;
    }
    if (name) {
      const p = pax(get(cells, 'pax'));
      guest = {
        guestName: tidyName(name),
        phone: phone(get(cells, 'phone')),
        nationality: nationality(get(cells, 'nationality')),
        agency: agency(get(cells, 'agency')),
        adults: p.adults,
        children: p.children,
      };
    }
    if (when.value) year = Number(when.value.slice(0, 4));
    const p = pax(get(cells, 'pax'));
    const time = parseLegacyTime(timeCell);
    const flight = text(flightCell);
    const notes: Array<string | null> = [extra(cells)];
    if (when.raw) notes.push(`Date in sheet: ${when.raw}`);
    if (p.note) notes.push(`Pax: ${p.note}`);
    if (text(timeCell) && (!time.value || time.status === 'AMBIGUOUS')) notes.push(`Pickup in sheet: ${text(timeCell)}`);

    out.records.push({
      kind: 'TRANSFER',
      row,
      guestName: guest!.guestName,
      phone: guest!.phone,
      nationality: guest!.nationality,
      fromPlace: from ? tidyName(from) : null,
      toPlace: to ? tidyName(to) : null,
      adults: name ? p.adults : guest!.adults,
      children: name ? p.children : guest!.children,
      date: when.value,
      flightNo: flight && !/^-+$/.test(flight) ? flight.toUpperCase().replace(/\s+/g, ' ') : null,
      time: time.value,
      agency: guest!.agency,
      notes: joinNotes(...notes),
    });
  }
}

function excursionSheet({ get, rows, out, extra }: Ctx) {
  let guest: Pick<ExcursionRecord, 'guestName' | 'phone' | 'nationality' | 'agency' | 'adults' | 'children' | 'hotelName'> | null = null;
  let year = firstYear(rows, get, ['date']);
  for (const { row, cells } of rows) {
    const name = text(get(cells, 'name'));
    if (isSectionRow(cells, get(cells, 'name'))) continue;
    const activity = text(get(cells, 'activity'));
    const hotelCell = text(get(cells, 'hotel'));
    const when = date(get(cells, 'date'), year);
    if (!name && !guest) {
      out.skipped.push({ row, reason: 'No guest name and no guest above it' });
      continue;
    }
    if (name) {
      guest = {
        guestName: tidyName(name),
        phone: phone(get(cells, 'phone')),
        nationality: nationality(get(cells, 'nationality')),
        agency: agency(get(cells, 'agency')),
        adults: count(get(cells, 'pax')),
        children: count(get(cells, 'child')),
        hotelName: hotelCell ? tidyName(hotelCell) : null,
      };
    }
    if (!activity && !name) {
      // Not an activity — usually a note under the guest (e.g. who drives them).
      const note = joinNotes(hotelCell, when.raw, extra(cells));
      const last = out.records[out.records.length - 1] as ExcursionRecord | undefined;
      if (note && last) last.notes = joinNotes(last.notes, note);
      else out.skipped.push({ row, reason: 'No activity on this row' });
      continue;
    }
    if (when.value) year = Number(when.value.slice(0, 4));
    const rest = text(get(cells, 'rest'));
    const notes: Array<string | null> = [extra(cells)];
    if (when.raw) notes.push(`Date in sheet: ${when.raw}`);
    if (rest && !/^no$/i.test(rest)) notes.push(`Rest: ${rest}`);

    out.records.push({
      kind: 'EXCURSION',
      row,
      guestName: guest!.guestName,
      phone: guest!.phone,
      nationality: guest!.nationality,
      // With the activity column empty, the text in HOTEL is the activity itself.
      hotelName: !activity ? null : name ? guest!.hotelName : hotelCell ? tidyName(hotelCell) : guest!.hotelName,
      activity: activity ?? hotelCell ?? '—',
      date: when.value,
      adults: guest!.adults,
      children: guest!.children,
      agency: guest!.agency,
      notes: joinNotes(...notes),
    });
  }
}

function visaSheet({ get, rows, out, extra }: Ctx) {
  let year = firstYear(rows, get, ['date']);
  for (const { row, cells } of rows) {
    const nameCell = get(cells, 'name');
    if (isSectionRow(cells, nameCell)) continue;
    const name = text(nameCell);
    const from = text(get(cells, 'from'));
    const to = text(get(cells, 'to'));
    if (!name && !from && !to) continue;
    const when = date(get(cells, 'date'), year);
    if (when.value) year = Number(when.value.slice(0, 4));
    const agencyName = agency(get(cells, 'agency'));
    out.records.push({
      kind: 'VISA',
      row,
      guestName: name ? tidyName(name) : `${agencyName ?? 'Group'} (no name)`,
      phone: phone(get(cells, 'phone')),
      nationality: nationality(get(cells, 'nationality')),
      fromPlace: from ? tidyName(from.replace(/^beurit$/i, 'Beirut')) : null,
      toPlace: to ? tidyName(to) : null,
      pax: count(get(cells, 'pax')) ?? 1,
      travelDate: when.value,
      agency: agencyName,
      cost: amount(get(cells, 'net')),
      sell: amount(get(cells, 'sell')),
      notes: joinNotes(extra(cells), when.raw ? `Date in sheet: ${when.raw}` : null),
    });
  }
}

function paymentSheet({ get, rows, out }: Ctx) {
  let year = firstYear(rows, get, ['checkIn', 'paidOn']);
  for (const { row, cells } of rows) {
    const hotel = text(get(cells, 'hotel'));
    if (!hotel) {
      if (cells.some((c) => text(c))) out.skipped.push({ row, reason: 'Payment row without a hotel name' });
      continue;
    }
    const checkIn = date(get(cells, 'checkIn'), year);
    if (checkIn.value) year = Number(checkIn.value.slice(0, 4));
    const total = money(get(cells, 'total'));
    const paid = money(get(cells, 'paid'));
    const paidOn = date(get(cells, 'paidOn'), year);
    const raw = ['total', 'paid', 'rest']
      .map((f) => [f, text(get(cells, f))] as const)
      .filter(([, v]) => v)
      .map(([f, v]) => `${f.toUpperCase()} ${v}`)
      .join(', ');
    out.records.push({
      kind: 'PAYMENT',
      row,
      hotel: tidyName(hotel),
      checkIn: checkIn.value,
      total: total.amount,
      paid: paid.amount,
      paidOn: paidOn.value,
      currency: (total.currency ?? paid.currency ?? null) as CurrencyCode | null,
      raw,
    });
  }
}

function salesSheet({ get, rows, out }: Ctx) {
  const n = (v: unknown) => amount(v) ?? 0;
  for (const { row, cells } of rows) {
    const name = text(get(cells, 'name'));
    if (!name) continue;
    const from = date(get(cells, 'from'));
    const to = date(get(cells, 'to'));
    out.records.push({
      kind: 'SALES',
      row,
      customerName: tidyName(name),
      nationality: nationality(get(cells, 'nationality')),
      phone: phone(get(cells, 'phone')),
      destination: text(get(cells, 'destination')),
      hotelName: text(get(cells, 'hotel')),
      adults: count(get(cells, 'adults')) ?? 1,
      children: count(get(cells, 'children')) ?? 0,
      singleRooms: count(get(cells, 'single')) ?? 0,
      doubleRooms: count(get(cells, 'double')) ?? 0,
      tripleRooms: count(get(cells, 'triple')) ?? 0,
      startDate: from.value,
      endDate: to.value,
      paymentDate: date(get(cells, 'paymentDate')).value,
      hotelCost: n(get(cells, 'hotelCost')),
      hotelSell: n(get(cells, 'hotelSell')),
      flightCost: n(get(cells, 'flightCost')),
      flightSell: n(get(cells, 'flightSell')),
      flightCommission: n(get(cells, 'flightCommission')),
      transferDetails: text(get(cells, 'transfer')),
      transferCost: n(get(cells, 'transferCost')),
      transferSell: n(get(cells, 'transferSell')),
      serviceType: text(get(cells, 'serviceType')),
      serviceCost: n(get(cells, 'serviceCost')),
      serviceSell: n(get(cells, 'serviceSell')),
      seller: text(get(cells, 'seller')),
      paid: n(get(cells, 'paid')),
    });
  }
}

// ---------------------------------------------------------------------------

/**
 * A stable fingerprint of what a row books, so importing the same sheet twice
 * adds only the new rows. Identical rows in one file stay distinct by position.
 */
export function sourceKeys(records: ImportRecord[]): string[] {
  const seen = new Map<string, number>();
  return records.map((r) => {
    let basis: unknown[];
    switch (r.kind) {
      case 'HOTEL': basis = [r.guestName, r.checkIn, r.checkOut, r.hotel && hotelKey(r.hotel), r.rooms]; break;
      case 'TRANSFER': basis = [r.guestName, r.date, r.fromPlace, r.toPlace, r.time]; break;
      case 'EXCURSION': basis = [r.guestName, r.date, r.activity]; break;
      case 'VISA': basis = [r.guestName, r.travelDate, r.fromPlace, r.pax]; break;
      case 'SALES': basis = [r.customerName, r.phone, r.startDate, r.endDate, r.hotelName]; break;
      case 'PAYMENT': basis = [hotelKey(r.hotel), r.checkIn, r.total, r.paid]; break;
    }
    const base = `${r.kind}|${basis.map((b) => String(b ?? '').toLowerCase().trim()).join('|')}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash('sha1').update(`${base}|${n}`).digest('hex').slice(0, 24);
  });
}
