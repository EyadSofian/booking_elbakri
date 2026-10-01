import { Controller, Get, Injectable, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { CurrencyCode, EntityType, Status } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { DomainError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { toDbDate, todayIn } from '../../common/values';
import {
  DIRECT_AGENCY, hotelKey, parseWorkbook, sourceKeys,
  type ExcursionRecord, type HotelRecord, type ImportRecord, type PaymentRecord, type SalesRecord, type SheetKind,
  type TransferRecord, type VisaRecord,
} from './sheet-parser';
import { guessKind } from '../ops/transfers.module';

interface UploadedWorkbook {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface SheetResult {
  name: string;
  kind: SheetKind | null;
  rows: number;
  /** Not in the system yet — these are what "Import" adds. */
  fresh: number;
  /** Already imported earlier (same guest, dates and service). */
  existing: number;
  created: number;
  /** Payment rows only: rows matched to a hotel booking / not matched. */
  matched: number;
  unmatched: Array<{ row: number; label: string }>;
  skipped: Array<{ row: number; reason: string }>;
  sample: Array<{ row: number; title: string; detail: string; date: string | null }>;
}

export interface ImportResult {
  fileName: string;
  applied: boolean;
  sheets: SheetResult[];
}

type Tx = PrismaService;

@Injectable()
export class ImportsService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  async history() {
    const rows = await this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  /**
   * Reads a workbook and reports what importing it would do, or does it.
   * Rows already imported are recognised by their fingerprint and left alone,
   * so re-importing an updated sheet only adds the new bookings.
   */
  async run(buffer: Buffer, fileName: string, apply: boolean, userId: string | null): Promise<ImportResult> {
    let sheets;
    try {
      sheets = await parseWorkbook(buffer);
    } catch {
      throw new DomainError('UNKNOWN_WORKBOOK', 'This file could not be read as an Excel workbook (.xlsx).', 400);
    }
    if (!sheets.some((s) => s.kind)) {
      throw new DomainError(
        'UNKNOWN_WORKBOOK',
        'No booking sheet was recognised. The header row must contain columns such as NAME, CHECK IN, HOTEL.',
        400,
      );
    }

    const resolver = new Resolver(this.prisma);
    const results: SheetResult[] = [];
    for (const sheet of sheets) {
      const result: SheetResult = {
        name: sheet.name, kind: sheet.kind, rows: sheet.records.length, fresh: 0, existing: 0, created: 0,
        matched: 0, unmatched: [], skipped: sheet.skipped.slice(0, 50), sample: [],
      };
      results.push(result);
      if (!sheet.kind || !sheet.records.length) continue;

      if (sheet.kind === 'PAYMENT') {
        await this.payments(sheet.records as PaymentRecord[], result, apply);
      } else {
        const keys = sourceKeys(sheet.records);
        const existing = await this.existingKeys(sheet.kind, keys);
        const fresh = sheet.records.map((r, i) => ({ r, key: keys[i] })).filter(({ key }) => !existing.has(key));
        result.existing = sheet.records.length - fresh.length;
        result.fresh = fresh.length;
        result.sample = fresh.slice(0, 8).map(({ r }) => describe(r));
        if (apply) {
          for (const { r, key } of fresh) {
            await this.create(r, key, resolver, userId, fileName);
            result.created += 1;
          }
        }
      }
      if (apply) {
        await this.prisma.importBatch.create({
          data: {
            fileName: `${fileName} › ${sheet.name}`,
            kind: sheet.kind,
            created: result.created || result.matched,
            skipped: result.existing + result.unmatched.length,
            userId,
          },
        });
      }
    }
    return { fileName, applied: apply, sheets: results };
  }

  private async existingKeys(kind: SheetKind, keys: string[]): Promise<Set<string>> {
    const where = { sourceKey: { in: keys } };
    const select = { sourceKey: true } as const;
    let rows: Array<{ sourceKey: string | null }> = [];
    if (kind === 'HOTEL') rows = await this.prisma.hotelBooking.findMany({ where, select });
    if (kind === 'TRANSFER') rows = await this.prisma.transfer.findMany({ where, select });
    if (kind === 'EXCURSION') rows = await this.prisma.excursion.findMany({ where, select });
    if (kind === 'VISA') rows = await this.prisma.visa.findMany({ where, select });
    if (kind === 'SALES') rows = await this.prisma.sale.findMany({ where, select });
    return new Set(rows.map((r) => r.sourceKey!));
  }

  /** Imported bookings already happened or are booked: done if past, confirmed if ahead. */
  private status(date: string | null): Status {
    return date && date < todayIn(this.tz) ? 'DONE' : 'CONFIRMED';
  }

  private async create(r: ImportRecord, sourceKey: string, resolver: Resolver, userId: string | null, fileName: string) {
    const createdById = userId;
    let type: EntityType;
    let id: string;
    switch (r.kind) {
      case 'HOTEL': {
        const rec = r as HotelRecord;
        const row = await this.prisma.hotelBooking.create({
          data: {
            status: this.status(rec.checkOut ?? rec.checkIn),
            guestName: rec.guestName,
            nationality: rec.nationality,
            phone: rec.phone,
            agencyId: await resolver.agency(rec.agency),
            hotelId: await resolver.hotel(rec.hotel),
            checkIn: toDbDate(rec.checkIn),
            checkOut: toDbDate(rec.checkOut),
            rooms: rec.rooms,
            mealPlan: rec.mealPlan,
            bookingDate: toDbDate(rec.bookingDate),
            currency: rec.agency === DIRECT_AGENCY || !rec.agency ? 'EGP' : 'USD',
            notes: rec.notes,
            sourceKey,
            createdById,
          },
        });
        type = 'HOTEL';
        id = row.id;
        break;
      }
      case 'TRANSFER': {
        const rec = r as TransferRecord;
        const row = await this.prisma.transfer.create({
          data: {
            status: this.status(rec.date),
            kind: guessKind(rec.fromPlace, rec.toPlace),
            guestName: rec.guestName,
            nationality: rec.nationality,
            phone: rec.phone,
            agencyId: await resolver.agency(rec.agency),
            date: toDbDate(rec.date),
            time: rec.time,
            fromPlace: rec.fromPlace,
            toPlace: rec.toPlace,
            flightNo: rec.flightNo,
            adults: rec.adults,
            children: rec.children,
            currency: rec.agency === DIRECT_AGENCY || !rec.agency ? 'EGP' : 'USD',
            notes: rec.notes,
            sourceKey,
            createdById,
          },
        });
        type = 'TRANSFER';
        id = row.id;
        break;
      }
      case 'EXCURSION': {
        const rec = r as ExcursionRecord;
        const row = await this.prisma.excursion.create({
          data: {
            status: this.status(rec.date),
            guestName: rec.guestName,
            nationality: rec.nationality,
            phone: rec.phone,
            agencyId: await resolver.agency(rec.agency),
            activity: rec.activity,
            hotelName: rec.hotelName,
            date: toDbDate(rec.date),
            adults: rec.adults,
            children: rec.children,
            currency: rec.agency === DIRECT_AGENCY || !rec.agency ? 'EGP' : 'USD',
            notes: rec.notes,
            sourceKey,
            createdById,
          },
        });
        type = 'EXCURSION';
        id = row.id;
        break;
      }
      case 'VISA': {
        const rec = r as VisaRecord;
        const row = await this.prisma.visa.create({
          data: {
            status: this.status(rec.travelDate),
            guestName: rec.guestName,
            nationality: rec.nationality,
            phone: rec.phone,
            agencyId: await resolver.agency(rec.agency),
            pax: rec.pax,
            fromPlace: rec.fromPlace,
            toPlace: rec.toPlace,
            travelDate: toDbDate(rec.travelDate),
            currency: 'USD',
            cost: rec.cost,
            sell: rec.sell,
            notes: rec.notes,
            sourceKey,
            createdById,
          },
        });
        type = 'VISA';
        id = row.id;
        break;
      }
      case 'SALES': {
        const rec = r as SalesRecord;
        const seller = await resolver.user(rec.seller);
        const row = await this.prisma.sale.create({
          data: {
            status: this.status(rec.endDate ?? rec.startDate),
            saleDate: toDbDate(rec.paymentDate ?? rec.startDate ?? todayIn(this.tz))!,
            customerName: rec.customerName,
            nationality: rec.nationality,
            phone: rec.phone,
            destination: rec.destination,
            adults: rec.adults,
            children: rec.children,
            startDate: toDbDate(rec.startDate),
            endDate: toDbDate(rec.endDate),
            lines: { create: salesSheetLines(rec) },
            sellerId: seller,
            notes: rec.seller && !seller ? `Seller in sheet: ${rec.seller}` : null,
            sourceKey,
            createdById,
            payments: rec.paid > 0
              ? { create: { amount: rec.paid, paidOn: toDbDate(rec.paymentDate ?? rec.startDate ?? todayIn(this.tz))!, createdById } }
              : undefined,
          },
        });
        type = 'SALE';
        id = row.id;
        break;
      }
      default:
        return;
    }
    await this.prisma.activity.create({
      data: {
        entityType: type,
        entityId: id,
        action: 'IMPORTED',
        summary: `${fileName} · row ${r.row}`,
        userId,
      },
    });
  }

  /**
   * The payment sheet is about hotel bookings already in the system: each row
   * is matched to the booking with the same hotel and check-in date, and fills
   * in what ELBAKRI owes that hotel and what it has paid.
   */
  private async payments(records: PaymentRecord[], result: SheetResult, apply: boolean) {
    const bookings = await this.prisma.hotelBooking.findMany({
      where: { deletedAt: null, checkIn: { not: null } },
      select: {
        id: true, checkIn: true, cost: true, notes: true, currency: true,
        hotel: { select: { name: true } },
        agency: { select: { isDirect: true } },
      },
    });
    const byDate = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const d = b.checkIn!.toISOString().slice(0, 10);
      byDate.set(d, [...(byDate.get(d) ?? []), b]);
    }
    const tokens = (s: string) => new Set(hotelKey(s).split(' ').filter((t) => t.length > 2 && !STOP_WORDS.has(t)));

    const used = new Set<string>();
    for (const rec of records) {
      const label = `${rec.hotel}${rec.checkIn ? ` · ${rec.checkIn}` : ''}${rec.raw ? ` · ${rec.raw}` : ''}`;
      if (!rec.checkIn || (rec.total === null && rec.paid === null)) {
        result.unmatched.push({ row: rec.row, label });
        continue;
      }
      const wanted = tokens(rec.hotel);
      const candidates = (byDate.get(rec.checkIn) ?? []).filter((b) => {
        if (used.has(b.id) || !b.hotel) return false;
        const have = tokens(b.hotel.name);
        return [...wanted].some((t) => have.has(t)) || hotelKey(b.hotel.name) === hotelKey(rec.hotel);
      });
      const exact = candidates.filter((b) => hotelKey(b.hotel!.name) === hotelKey(rec.hotel));
      const pick = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
      if (!pick) {
        result.unmatched.push({ row: rec.row, label });
        continue;
      }
      used.add(pick.id);
      if (pick.cost !== null) {
        result.existing += 1;
        continue;
      }
      result.matched += 1;
      result.fresh += 1;
      if (result.sample.length < 8) {
        result.sample.push({ row: rec.row, title: rec.hotel, detail: rec.raw, date: rec.checkIn });
      }
      if (apply) {
        const currency: CurrencyCode = rec.currency ?? (pick.agency?.isDirect ? 'EGP' : 'USD');
        await this.prisma.hotelBooking.update({
          where: { id: pick.id },
          data: {
            cost: rec.total ?? undefined,
            paidToHotel: rec.paid ?? undefined,
            hotelPaidOn: toDbDate(rec.paidOn) ?? undefined,
            currency,
            notes: [pick.notes, `Payment sheet: ${rec.raw}`].filter(Boolean).join(' · '),
          },
        });
        result.created += 1;
      }
    }
  }
}

/** A sales-sheet row has at most one of each; each part that has anything becomes a line. */
function salesSheetLines(r: SalesRecord) {
  const start = toDbDate(r.startDate) ?? null;
  const lines = [];
  if (r.hotelName || r.hotelCost || r.hotelSell) {
    lines.push({
      kind: 'HOTEL' as const, title: r.hotelName, startDate: start, endDate: toDbDate(r.endDate) ?? null,
      singleRooms: r.singleRooms, doubleRooms: r.doubleRooms, tripleRooms: r.tripleRooms, cost: r.hotelCost, sell: r.hotelSell,
    });
  }
  if (r.flightCost || r.flightSell || r.flightCommission) {
    lines.push({ kind: 'FLIGHT' as const, startDate: start, cost: r.flightCost, sell: r.flightSell, commission: r.flightCommission });
  }
  if (r.transferDetails || r.transferCost || r.transferSell) {
    lines.push({ kind: 'TRANSFER' as const, title: r.transferDetails, startDate: start, cost: r.transferCost, sell: r.transferSell });
  }
  if (r.serviceType || r.serviceCost || r.serviceSell) {
    lines.push({ kind: 'SERVICE' as const, title: r.serviceType, startDate: start, cost: r.serviceCost, sell: r.serviceSell });
  }
  return lines.map((l, position) => ({ ...l, position }));
}

const STOP_WORDS = new Set(['hotel', 'resort', 'the', 'and', 'spa', 'beach', 'sharm', 'hurghada', 'cairo', 'pickalbatros', 'albatros', 'club']);

function describe(r: ImportRecord): SheetResult['sample'][number] {
  switch (r.kind) {
    case 'HOTEL': return { row: r.row, title: r.guestName, detail: [r.hotel, r.rooms, r.mealPlan].filter(Boolean).join(' · '), date: r.checkIn };
    case 'TRANSFER': return { row: r.row, title: r.guestName, detail: [r.fromPlace, r.toPlace].filter(Boolean).join(' → '), date: r.date };
    case 'EXCURSION': return { row: r.row, title: r.guestName, detail: r.activity, date: r.date };
    case 'VISA': return { row: r.row, title: r.guestName, detail: [r.fromPlace, r.toPlace].filter(Boolean).join(' → '), date: r.travelDate };
    case 'SALES': return { row: r.row, title: r.customerName, detail: [r.destination, r.hotelName].filter(Boolean).join(' · '), date: r.startDate };
    case 'PAYMENT': return { row: r.row, title: r.hotel, detail: r.raw, date: r.checkIn };
  }
}

/** Finds or creates agencies, hotels and sellers by name, once per import. */
class Resolver {
  private agencies = new Map<string, string>();
  private hotels: Map<string, string> | null = null;
  private users: Array<{ id: string; name: string }> | null = null;

  constructor(private readonly prisma: Tx) {}

  async agency(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    const cached = this.agencies.get(key);
    if (cached) return cached;
    const found =
      (await this.prisma.agency.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) ??
      (await this.prisma.agency.create({ data: { name, isDirect: name === DIRECT_AGENCY } }));
    this.agencies.set(key, found.id);
    return found.id;
  }

  async hotel(name: string | null): Promise<string | null> {
    if (!name) return null;
    if (!this.hotels) {
      const all = await this.prisma.hotel.findMany({ select: { id: true, name: true } });
      this.hotels = new Map(all.map((h) => [hotelKey(h.name), h.id]));
    }
    const key = hotelKey(name);
    const cached = this.hotels.get(key);
    if (cached) return cached;
    const created = await this.prisma.hotel.create({ data: { name } });
    this.hotels.set(key, created.id);
    return created.id;
  }

  async user(name: string | null): Promise<string | null> {
    if (!name) return null;
    if (!this.users) this.users = await this.prisma.user.findMany({ select: { id: true, name: true } });
    const n = name.toLowerCase().trim();
    return this.users.find((u) => u.name.toLowerCase() === n || u.name.toLowerCase().split(' ')[0] === n)?.id ?? null;
  }
}

@ApiTags('imports')
@ApiBearerAuth()
@Roles('OPERATIONS')
@Controller({ path: 'imports', version: '1' })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  history() {
    return this.imports.history();
  }

  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  preview(@UploadedFile() file: UploadedWorkbook) {
    if (!file) throw new DomainError('VALIDATION_FAILED', 'Choose an Excel file to import.', 400);
    return this.imports.run(file.buffer, decodeName(file.originalname), false, null);
  }

  @Post('apply')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  apply(@UploadedFile() file: UploadedWorkbook, @CurrentUser() user: AuthUser) {
    if (!file) throw new DomainError('VALIDATION_FAILED', 'Choose an Excel file to import.', 400);
    return this.imports.run(file.buffer, decodeName(file.originalname), true, user.id);
  }
}

/** Browsers send non-ASCII filenames (Arabic) as latin1-decoded UTF-8. */
function decodeName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}
