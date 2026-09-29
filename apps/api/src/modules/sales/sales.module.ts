import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import {
  CURRENCIES, OPEN_STATUSES, PAYMENT_METHODS, STATUSES, computeSaleTotals, countNights, formatRef, roomsText,
  type CurrencyCode, type ListResponse, type MoneyByCurrency, type SaleDetail, type SaleItem, type SalePaymentItem,
  type SalePaymentMethod, type Status,
} from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, toCounts } from '../../common/list';
import { clean, fromDbDate, num, num0, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import { STATUS_LABEL, StatusDto } from '../ops/ops-common';
import { HotelBookingsService } from '../ops/hotel-bookings.module';
import { TransfersService } from '../ops/transfers.module';
import { ExcursionsService } from '../ops/excursions.module';
import { VisasService } from '../ops/visas.module';

const money = () => [IsNumber({ maxDecimalPlaces: 2 }), Min(0), IsOptional()];
function Money(): PropertyDecorator {
  return (target, key) => money().forEach((d) => d(target, key));
}

class PaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount!: number;

  @IsDateOnly()
  paidOn!: string;

  @IsIn(PAYMENT_METHODS) @IsOptional()
  method?: SalePaymentMethod | null;

  @IsString() @MaxLength(500) @IsOptional()
  note?: string | null;
}

class RequestsDto {
  @IsBoolean() @IsOptional()
  hotel?: boolean;

  @IsBoolean() @IsOptional()
  transfer?: boolean;
}

export class SaleDto {
  @IsIn(STATUSES) @IsOptional()
  status?: Status;

  /** The day the sale was made; today when left out. */
  @IsDateOnly() @IsOptional()
  saleDate?: string;

  @IsString() @MinLength(1) @MaxLength(200)
  customerName!: string;

  @IsString() @MaxLength(100) @IsOptional()
  nationality?: string | null;

  @IsString() @MaxLength(60) @IsOptional()
  phone?: string | null;

  @IsString() @MaxLength(200) @IsOptional()
  destination?: string | null;

  @IsString() @MaxLength(200) @IsOptional()
  hotelName?: string | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  adults?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  children?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  singleRooms?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  doubleRooms?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  tripleRooms?: number;

  @IsDateOnly() @IsOptional()
  startDate?: string | null;

  @IsDateOnly() @IsOptional()
  endDate?: string | null;

  @IsIn(CURRENCIES) @IsOptional()
  currency?: CurrencyCode;

  @Money() hotelCost?: number;
  @Money() hotelSell?: number;

  @IsString() @MaxLength(300) @IsOptional()
  flightDetails?: string | null;

  @Money() flightCost?: number;
  @Money() flightSell?: number;
  @Money() flightCommission?: number;

  @IsString() @MaxLength(300) @IsOptional()
  transferDetails?: string | null;

  @Money() transferCost?: number;
  @Money() transferSell?: number;

  @IsString() @MaxLength(200) @IsOptional()
  serviceType?: string | null;

  @Money() serviceCost?: number;
  @Money() serviceSell?: number;

  @IsUUID() @IsOptional()
  sellerId?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @IsOptional()
  commissionRate?: number;

  @IsString() @MaxLength(4000) @IsOptional()
  notes?: string | null;

  /** Money taken when the booking is made. */
  @ValidateNested() @Type(() => PaymentDto) @IsOptional()
  initialPayment?: PaymentDto;

  /** Ask operations to book these services straight away. */
  @ValidateNested() @Type(() => RequestsDto) @IsOptional()
  requests?: RequestsDto;
}

export class UpdateSaleDto extends PartialType(OmitType(SaleDto, ['initialPayment', 'requests'] as const)) {}

export class SalesListQuery extends ListQueryDto {
  @IsUUID() @IsOptional()
  sellerId?: string;

  /** Which date the date filters apply to: the sale date or the trip start. */
  @IsIn(['sale', 'trip']) @IsOptional()
  dateBy?: 'sale' | 'trip';

  /** `due`: the customer still owes money. */
  @IsIn(['due', 'paid']) @IsOptional()
  balance?: 'due' | 'paid';
}

const include = {
  seller: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  payments: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: [{ paidOn: 'asc' as const }, { createdAt: 'asc' as const }] },
  hotelBookings: { where: { deletedAt: null }, select: { status: true } },
  transfers: { where: { deletedAt: null }, select: { status: true } },
  excursions: { where: { deletedAt: null }, select: { status: true } },
  visas: { where: { deletedAt: null }, select: { status: true } },
};

const TRACKED = [
  'status', 'saleDate', 'customerName', 'nationality', 'phone', 'destination', 'hotelName', 'adults', 'children', 'singleRooms',
  'doubleRooms', 'tripleRooms', 'startDate', 'endDate', 'currency', 'hotelCost', 'hotelSell', 'flightDetails',
  'flightCost', 'flightSell', 'flightCommission', 'transferDetails', 'transferCost', 'transferSell', 'serviceType',
  'serviceCost', 'serviceSell', 'seller', 'commissionRate', 'notes',
] as const;

type Row = NonNullable<Awaited<ReturnType<SalesService['findRow']>>>;

@Injectable()
export class SalesService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly hotels: HotelBookingsService,
    private readonly transfers: TransfersService,
    private readonly excursions: ExcursionsService,
    private readonly visas: VisasService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  /**
   * A salesperson only ever sees their own sales — the ones they sold or
   * entered. Admin and operations are not narrowed.
   */
  private scope(user?: AuthUser): Record<string, unknown> {
    return user?.role === 'SALES' ? { OR: [{ sellerId: user.id }, { createdById: user.id }] } : {};
  }

  /** Sales visible to this user (the open-request badge and the home page count these). */
  scopeFor(user?: AuthUser): Record<string, unknown> {
    return this.scope(user);
  }

  findRow(id: string, user?: AuthUser) {
    return this.prisma.sale.findFirst({ where: { id, deletedAt: null, ...this.scope(user) }, include });
  }

  /** Throws "not found" unless the user may see the sale. */
  async assertVisible(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id, user);
  }

  private paymentItem(p: Row['payments'][number]): SalePaymentItem {
    return {
      id: p.id,
      amount: num0(p.amount),
      paidOn: fromDbDate(p.paidOn)!,
      method: (p.method as SalePaymentMethod | null) ?? null,
      note: p.note,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
    };
  }

  toItem(row: Row): SaleItem {
    const pricing = {
      hotelCost: num0(row.hotelCost),
      hotelSell: num0(row.hotelSell),
      flightCost: num0(row.flightCost),
      flightSell: num0(row.flightSell),
      flightCommission: num0(row.flightCommission),
      transferCost: num0(row.transferCost),
      transferSell: num0(row.transferSell),
      serviceCost: num0(row.serviceCost),
      serviceSell: num0(row.serviceSell),
      commissionRate: num0(row.commissionRate),
      paid: row.payments.reduce((sum, p) => sum + Number(p.amount), 0),
    };
    const linked = [...row.hotelBookings, ...row.transfers, ...row.excursions, ...row.visas];
    const startDate = fromDbDate(row.startDate);
    const endDate = fromDbDate(row.endDate);
    const lastPayment = row.payments[row.payments.length - 1];
    return {
      ...pricing,
      ...computeSaleTotals(pricing),
      id: row.id,
      number: row.number,
      ref: formatRef('SALE', row.number),
      status: row.status,
      saleDate: fromDbDate(row.saleDate)!,
      customerName: row.customerName,
      nationality: row.nationality,
      phone: row.phone,
      destination: row.destination,
      hotelName: row.hotelName,
      adults: row.adults,
      children: row.children,
      singleRooms: row.singleRooms,
      doubleRooms: row.doubleRooms,
      tripleRooms: row.tripleRooms,
      startDate,
      endDate,
      nights: countNights(startDate, endDate),
      currency: row.currency,
      flightDetails: row.flightDetails,
      transferDetails: row.transferDetails,
      serviceType: row.serviceType,
      seller: row.seller,
      lastPaymentOn: lastPayment ? fromDbDate(lastPayment.paidOn) : null,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      requests: { total: linked.length, open: linked.filter((l) => OPEN_STATUSES.includes(l.status)).length },
    };
  }

  private where(q: SalesListQuery, user?: AuthUser): Record<string, unknown> {
    const and: Record<string, unknown>[] = [{ deletedAt: null }, this.scope(user)];
    const term = q.q?.trim();
    if (term) {
      const or: Record<string, unknown>[] = ['customerName', 'phone', 'nationality', 'destination', 'hotelName', 'notes', 'flightDetails', 'serviceType']
        .map((f) => ({ [f]: { contains: term, mode: 'insensitive' } }));
      const n = term.match(/^[A-Za-z]?-?(\d{1,9})$/);
      if (n) or.push({ number: Number(n[1]) });
      and.push({ OR: or });
    }
    if (q.sellerId) and.push({ sellerId: q.sellerId });
    const range = dateRange(q, todayIn(this.tz), todayIn(this.tz, 1));
    if (range) and.push(q.dateBy === 'sale' ? { saleDate: range } : { startDate: range });
    return { AND: and };
  }

  async list(q: SalesListQuery, user?: AuthUser): Promise<ListResponse<SaleItem> & { totals: SaleTotalsByCurrency[] }> {
    const where = this.where(q, user);
    const filtered = q.status?.length ? { AND: [where, { status: { in: q.status } }] } : where;
    const dir = q.sortDir ?? 'desc';
    const sort: Record<string, unknown>[] =
      q.sortBy === 'startDate' ? [{ startDate: { sort: dir, nulls: 'last' } }, { number: 'desc' }]
        : q.sortBy === 'customerName' ? [{ customerName: dir }]
          : q.sortBy === 'number' ? [{ number: dir }]
            : [{ saleDate: dir }, { number: dir }];

    // Totals cover every matching sale, not just the page, so the whole set
    // is read; a travel agency's sales list stays small enough for that.
    const [rows, groups] = await Promise.all([
      this.prisma.sale.findMany({ where: filtered, include, orderBy: sort as never }),
      this.prisma.sale.groupBy({ by: ['status'], where: where as never, _count: { _all: true } }),
    ]);
    let items = rows.map((r) => this.toItem(r));
    if (q.balance === 'due') items = items.filter((s) => s.remaining > 0 && s.status !== 'CANCELLED');
    if (q.balance === 'paid') items = items.filter((s) => s.remaining <= 0);

    const start = (q.page - 1) * q.pageSize;
    return {
      data: items.slice(start, start + q.pageSize),
      total: items.length,
      page: q.page,
      pageSize: q.pageSize,
      counts: toCounts(groups),
      totals: totalsByCurrency(items.filter((s) => s.status !== 'CANCELLED')),
    };
  }

  private async mustFind(id: string, user?: AuthUser): Promise<Row> {
    const row = await this.findRow(id, user);
    if (!row) throw new NotFoundError('Sale', id);
    return row;
  }

  async get(id: string, user?: AuthUser): Promise<SaleDetail> {
    const row = await this.mustFind(id, user);
    const [hotelBookings, transfers, excursions, visas] = await Promise.all([
      this.hotels.list(Object.assign(new ListQueryDto(), { saleId: id, page: 1, pageSize: 100 })),
      this.transfers.list(Object.assign(new ListQueryDto(), { saleId: id, page: 1, pageSize: 100 })),
      this.excursions.list(Object.assign(new ListQueryDto(), { saleId: id, page: 1, pageSize: 100 })),
      this.visas.list(Object.assign(new ListQueryDto(), { saleId: id, page: 1, pageSize: 100 })),
    ]);
    return {
      ...this.toItem(row),
      payments: row.payments.map((p) => this.paymentItem(p)),
      hotelBookings: hotelBookings.data,
      transfers: transfers.data,
      excursions: excursions.data,
      visas: visas.data,
    };
  }

  private checkDates(start: string | null | undefined, end: string | null | undefined) {
    if (start && end && end < start) {
      throw new ValidationError('The trip cannot end before it starts.', 'END_BEFORE_START');
    }
  }

  private data(dto: UpdateSaleDto) {
    return {
      status: dto.status,
      saleDate: dto.saleDate ? toDbDate(dto.saleDate)! : undefined,
      customerName: dto.customerName === undefined ? undefined : clean(dto.customerName)!,
      nationality: clean(dto.nationality),
      phone: clean(dto.phone),
      destination: clean(dto.destination),
      hotelName: clean(dto.hotelName),
      adults: dto.adults,
      children: dto.children,
      singleRooms: dto.singleRooms,
      doubleRooms: dto.doubleRooms,
      tripleRooms: dto.tripleRooms,
      startDate: toDbDate(dto.startDate),
      endDate: toDbDate(dto.endDate),
      currency: dto.currency,
      hotelCost: dto.hotelCost,
      hotelSell: dto.hotelSell,
      flightDetails: clean(dto.flightDetails),
      flightCost: dto.flightCost,
      flightSell: dto.flightSell,
      flightCommission: dto.flightCommission,
      transferDetails: clean(dto.transferDetails),
      transferCost: dto.transferCost,
      transferSell: dto.transferSell,
      serviceType: clean(dto.serviceType),
      serviceCost: dto.serviceCost,
      serviceSell: dto.serviceSell,
      sellerId: dto.sellerId === undefined ? undefined : dto.sellerId || null,
      commissionRate: dto.commissionRate,
      notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
    };
  }

  async create(dto: SaleDto, user: AuthUser): Promise<SaleDetail> {
    this.checkDates(dto.startDate, dto.endDate);
    const data = this.data(dto);
    const sale = await this.prisma.sale.create({
      data: {
        ...data,
        saleDate: data.saleDate ?? toDbDate(todayIn(this.tz))!,
        customerName: data.customerName!,
        // The person entering the sale is the seller unless someone else is named.
        sellerId: data.sellerId === undefined ? user.id : data.sellerId,
        createdById: user.id,
      },
    });
    await this.activity.log({ type: 'SALE', id: sale.id, action: 'CREATED', userId: user.id });

    if (dto.initialPayment) await this.addPayment(sale.id, dto.initialPayment, user);
    if (dto.requests?.hotel || dto.requests?.transfer) await this.createRequests(sale.id, dto.requests, user);
    return this.get(sale.id);
  }

  /**
   * Hands the sale to operations: a hotel booking and/or a transfer in status
   * NEW, carrying the customer's details and linked back to this sale.
   */
  async createRequests(id: string, requests: RequestsDto, user: AuthUser): Promise<SaleDetail> {
    const sale = this.toItem(await this.mustFind(id, user));
    const direct = await this.prisma.agency.findFirst({ where: { isDirect: true, isActive: true }, orderBy: { createdAt: 'asc' } });
    const common = {
      guestName: sale.customerName,
      nationality: sale.nationality,
      phone: sale.phone,
      agencyId: direct?.id ?? null,
      currency: sale.currency,
      saleId: sale.id,
      status: 'NEW' as const,
    };

    if (requests.hotel) {
      let hotelId: string | null = null;
      if (sale.hotelName) {
        const hotel =
          (await this.prisma.hotel.findFirst({ where: { name: { equals: sale.hotelName, mode: 'insensitive' } } })) ??
          (await this.prisma.hotel.create({ data: { name: sale.hotelName } }));
        hotelId = hotel.id;
      }
      await this.hotels.create(
        {
          ...common,
          hotelId,
          checkIn: sale.startDate,
          checkOut: sale.endDate,
          rooms: roomsText(sale.singleRooms, sale.doubleRooms, sale.tripleRooms) || null,
          adults: sale.adults,
          children: sale.children,
          cost: sale.hotelCost || null,
          sell: sale.hotelSell || null,
          notes: sale.notes,
        },
        user,
      );
    }
    if (requests.transfer) {
      await this.transfers.create(
        {
          ...common,
          kind: 'ARRIVAL',
          toPlace: sale.hotelName,
          date: sale.startDate,
          adults: sale.adults,
          children: sale.children,
          cost: sale.transferCost || null,
          sell: sale.transferSell || null,
          notes: sale.transferDetails,
        },
        user,
      );
    }
    return this.get(id, user);
  }

  async update(id: string, dto: UpdateSaleDto, user: AuthUser): Promise<SaleDetail> {
    const before = this.toItem(await this.mustFind(id, user));
    this.checkDates(
      dto.startDate === undefined ? before.startDate : dto.startDate,
      dto.endDate === undefined ? before.endDate : dto.endDate,
    );
    await this.prisma.sale.update({ where: { id }, data: this.data(dto) });
    const after = this.toItem(await this.mustFind(id, user));
    const changes = this.activity.diff(snapshot(before), snapshot(after), TRACKED);
    if (changes) await this.activity.log({ type: 'SALE', id, action: 'UPDATED', userId: user.id, changes });
    return this.get(id, user);
  }

  async setStatus(id: string, status: Status, user: AuthUser): Promise<SaleItem> {
    const before = await this.mustFind(id, user);
    if (before.status !== status) {
      await this.prisma.sale.update({ where: { id }, data: { status } });
      await this.activity.log({
        type: 'SALE', id, action: 'STATUS', userId: user.id,
        summary: `${STATUS_LABEL[before.status]} → ${STATUS_LABEL[status]}`,
        changes: { status: { from: before.status, to: status } },
      });
    }
    return this.toItem(await this.mustFind(id, user));
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id, user);
    await this.prisma.sale.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log({ type: 'SALE', id, action: 'DELETED', userId: user.id });
  }

  async addPayment(id: string, dto: PaymentDto, user: AuthUser): Promise<SaleDetail> {
    const sale = await this.mustFind(id, user);
    await this.prisma.salePayment.create({
      data: {
        saleId: id,
        amount: dto.amount,
        paidOn: toDbDate(dto.paidOn)!,
        method: dto.method ?? null,
        note: clean(dto.note) ?? null,
        createdById: user.id,
      },
    });
    await this.activity.log({
      type: 'SALE', id, action: 'PAYMENT_ADDED', userId: user.id,
      summary: `${dto.amount} ${sale.currency} · ${dto.paidOn}`,
    });
    return this.get(id, user);
  }

  async removePayment(id: string, paymentId: string, user: AuthUser): Promise<SaleDetail> {
    const sale = await this.mustFind(id, user);
    const payment = sale.payments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundError('Payment', paymentId);
    await this.prisma.salePayment.delete({ where: { id: paymentId } });
    await this.activity.log({
      type: 'SALE', id, action: 'PAYMENT_REMOVED', userId: user.id,
      summary: `${num(payment.amount)} ${sale.currency} · ${fromDbDate(payment.paidOn)}`,
    });
    return this.get(id, user);
  }

  async export(q: SalesListQuery, res: Response, user: AuthUser): Promise<void> {
    const { data } = await this.list(Object.assign(new SalesListQuery(), q, { page: 1, pageSize: 100000 }), user);
    // The sales sheet, column for column.
    await sendWorkbook(res, `sales-${todayIn(this.tz)}.xlsx`, 'Sales', [
      { header: 'رقم الحجز', width: 9, value: (s) => s.ref },
      { header: 'تاريخ الحجز', width: 12, value: (s) => s.saleDate },
      { header: 'الاسم', width: 24, value: (s) => s.customerName },
      { header: 'الجنسية', value: (s) => s.nationality },
      { header: 'رقم الموبايل', value: (s) => s.phone },
      { header: 'الرحلة', value: (s) => s.destination },
      { header: 'الفندق', width: 22, value: (s) => s.hotelName },
      { header: 'بالغ', width: 7, value: (s) => s.adults },
      { header: 'طفل', width: 7, value: (s) => s.children },
      { header: 'سنجل', width: 7, value: (s) => s.singleRooms },
      { header: 'دبل', width: 7, value: (s) => s.doubleRooms },
      { header: 'تربل', width: 7, value: (s) => s.tripleRooms },
      { header: 'من', width: 12, value: (s) => s.startDate },
      { header: 'الي', width: 12, value: (s) => s.endDate },
      { header: 'عدد الليالي', width: 9, value: (s) => s.nights },
      { header: 'تاريخ الدفع', width: 12, value: (s) => s.lastPaymentOn },
      { header: 'تكلفة الفندق', value: (s) => s.hotelCost },
      { header: 'بيع الفندق', value: (s) => s.hotelSell },
      { header: 'ربح الفندق', value: (s) => s.hotelProfit },
      { header: 'تكلفة الطيران', value: (s) => s.flightCost },
      { header: 'بيع الطيران', value: (s) => s.flightSell },
      { header: 'عمولة الطيران', value: (s) => s.flightCommission },
      { header: 'ربح الطيران', value: (s) => s.flightProfit },
      { header: 'الانتقالات', width: 20, value: (s) => s.transferDetails },
      { header: 'تكلفة الانتقالات', value: (s) => s.transferCost },
      { header: 'بيع الانتقالات', value: (s) => s.transferSell },
      { header: 'ربح الانتقالات', value: (s) => s.transferProfit },
      { header: 'نوع الخدمة', width: 18, value: (s) => s.serviceType },
      { header: 'تكلفة الخدمة', value: (s) => s.serviceCost },
      { header: 'بيع الخدمة', value: (s) => s.serviceSell },
      { header: 'ربح الخدمة', value: (s) => s.serviceProfit },
      { header: 'اجمالي تكلفة', value: (s) => s.totalCost },
      { header: 'اجمالي بيع', value: (s) => s.totalSell },
      { header: 'اجمالي ربح', value: (s) => s.totalProfit },
      { header: 'البائع', width: 18, value: (s) => s.seller?.name },
      { header: 'العمولة', value: (s) => s.commission },
      { header: 'اجمالي المبلغ', value: (s) => s.customerTotal },
      { header: 'المدفوع', value: (s) => s.paid },
      { header: 'الباقي', value: (s) => s.remaining },
      { header: 'العملة', width: 8, value: (s) => s.currency },
      { header: 'الحالة', width: 12, value: (s) => STATUS_LABEL[s.status] },
      { header: 'ملاحظات', width: 30, value: (s) => s.notes },
    ], data);
  }
}

export interface SaleTotalsByCurrency {
  currency: CurrencyCode;
  count: number;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  commission: number;
  paid: number;
  remaining: number;
}

export function totalsByCurrency(items: SaleItem[]): SaleTotalsByCurrency[] {
  const map = new Map<CurrencyCode, SaleTotalsByCurrency>();
  for (const s of items) {
    const t = map.get(s.currency) ?? {
      currency: s.currency, count: 0, totalSell: 0, totalCost: 0, totalProfit: 0, commission: 0, paid: 0, remaining: 0,
    };
    t.count += 1;
    t.totalSell += s.totalSell;
    t.totalCost += s.totalCost;
    t.totalProfit += s.totalProfit;
    t.commission += s.commission;
    t.paid += s.paid;
    t.remaining += s.remaining;
    map.set(s.currency, t);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return [...map.values()].map((t) => ({
    ...t,
    totalSell: r(t.totalSell), totalCost: r(t.totalCost), totalProfit: r(t.totalProfit),
    commission: r(t.commission), paid: r(t.paid), remaining: r(t.remaining),
  }));
}

export function sumBy(items: SaleItem[], pick: (s: SaleItem) => number): MoneyByCurrency[] {
  const map = new Map<CurrencyCode, number>();
  for (const s of items) map.set(s.currency, (map.get(s.currency) ?? 0) + pick(s));
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
}

function snapshot(s: SaleItem): Record<string, unknown> {
  return { ...s, seller: s.seller?.name ?? null };
}

@ApiTags('sales')
@ApiBearerAuth()
@Controller({ path: 'sales', version: '1' })
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  list(@Query() q: SalesListQuery, @CurrentUser() user: AuthUser) {
    return this.service.list(q, user);
  }

  @Get('export')
  export(@Query() q: SalesListQuery, @Res() res: Response, @CurrentUser() user: AuthUser) {
    return this.service.export(q, res, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }

  @Get(':id/activity')
  async history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.service.assertVisible(id, user);
    return this.activity.list('SALE', id);
  }

  @Roles('SALES')
  @Post()
  create(@Body() dto: SaleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('SALES')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSaleDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Roles('SALES')
  @Patch(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentUser() user: AuthUser) {
    return this.service.setStatus(id, dto.status, user);
  }

  @Roles('SALES')
  @Post(':id/requests')
  requests(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestsDto, @CurrentUser() user: AuthUser) {
    return this.service.createRequests(id, dto, user);
  }

  @Roles('SALES')
  @Post(':id/payments')
  addPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto, @CurrentUser() user: AuthUser) {
    return this.service.addPayment(id, dto, user);
  }

  @Roles('SALES')
  @Delete(':id/payments/:paymentId')
  removePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removePayment(id, paymentId, user);
  }

  @Roles('SALES')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
