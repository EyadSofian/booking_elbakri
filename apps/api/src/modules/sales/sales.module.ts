import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import {
  CURRENCIES, PAYMENT_METHODS, SALE_LINE_KINDS, STATUSES, computeSaleTotals, countNights, formatRef, pricingFromLines,
  saleLineProfit, type CurrencyCode, type ListResponse, type MoneyByCurrency, type SaleDetail, type SaleItem,
  type SaleLineItem, type SaleLineKind, type SalePaymentItem, type SalePaymentMethod, type Status,
} from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, toCounts } from '../../common/list';
import { clean, fromDbDate, num, num0, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import { STATUS_LABEL, StatusDto } from '../ops/ops-common';

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

/** One thing sold: a hotel stay, a flight, a transfer or a service. */
export class SaleLineDto {
  @IsIn(SALE_LINE_KINDS)
  kind!: SaleLineKind;

  @IsString() @MaxLength(300) @IsOptional()
  title?: string | null;

  @IsDateOnly() @IsOptional()
  startDate?: string | null;

  @IsDateOnly() @IsOptional()
  endDate?: string | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  singleRooms?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  doubleRooms?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  tripleRooms?: number;

  @Money() cost?: number;
  @Money() sell?: number;
  @Money() commission?: number;
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

  @IsInt() @Min(0) @Max(999) @IsOptional()
  adults?: number;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  children?: number;

  @IsDateOnly() @IsOptional()
  startDate?: string | null;

  @IsDateOnly() @IsOptional()
  endDate?: string | null;

  @IsIn(CURRENCIES) @IsOptional()
  currency?: CurrencyCode;

  /** Everything sold on this sale, in order. Sent in full: it replaces the lines. */
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SaleLineDto) @IsOptional()
  lines?: SaleLineDto[];

  @IsUUID() @IsOptional()
  sellerId?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @IsOptional()
  commissionRate?: number;

  @IsString() @MaxLength(4000) @IsOptional()
  notes?: string | null;

  /** Money taken when the booking is made. */
  @ValidateNested() @Type(() => PaymentDto) @IsOptional()
  initialPayment?: PaymentDto;
}

export class UpdateSaleDto extends PartialType(OmitType(SaleDto, ['initialPayment'] as const)) {}

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
  lines: { orderBy: { position: 'asc' as const } },
};

/** The lines as one text per kind, e.g. two hotels read "Rixos + Jaz". */
function joinTitles(lines: SaleLineItem[], kind: SaleLineKind): string | null {
  return lines.filter((l) => l.kind === kind && l.title).map((l) => l.title).join(' + ') || null;
}

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
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  /**
   * A salesperson only ever sees their own sales — the ones they sold or
   * entered. Admin, operations and sales supervisors are not narrowed.
   */
  private scope(user?: AuthUser): Record<string, unknown> {
    return user?.role === 'SALES' && !user.seesAllSales ? { OR: [{ sellerId: user.id }, { createdById: user.id }] } : {};
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

  private lineItem(l: Row['lines'][number]): SaleLineItem {
    const money = { kind: l.kind, cost: num0(l.cost), sell: num0(l.sell), commission: num0(l.commission) };
    const startDate = fromDbDate(l.startDate);
    const endDate = fromDbDate(l.endDate);
    return {
      ...money,
      id: l.id,
      title: l.title,
      startDate,
      endDate,
      nights: l.kind === 'HOTEL' ? countNights(startDate, endDate) : null,
      singleRooms: l.singleRooms,
      doubleRooms: l.doubleRooms,
      tripleRooms: l.tripleRooms,
      profit: saleLineProfit(money),
    };
  }

  toItem(row: Row): SaleItem {
    const lines = row.lines.map((l) => this.lineItem(l));
    const hotels = lines.filter((l) => l.kind === 'HOTEL');
    const paid = row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const pricing = pricingFromLines(lines, num0(row.commissionRate), paid);
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
      hotelName: joinTitles(lines, 'HOTEL'),
      adults: row.adults,
      children: row.children,
      singleRooms: hotels.reduce((n, l) => n + l.singleRooms, 0),
      doubleRooms: hotels.reduce((n, l) => n + l.doubleRooms, 0),
      tripleRooms: hotels.reduce((n, l) => n + l.tripleRooms, 0),
      startDate,
      endDate,
      nights: countNights(startDate, endDate),
      currency: row.currency,
      flightDetails: joinTitles(lines, 'FLIGHT'),
      transferDetails: joinTitles(lines, 'TRANSFER'),
      serviceType: joinTitles(lines, 'SERVICE'),
      seller: row.seller,
      lastPaymentOn: lastPayment ? fromDbDate(lastPayment.paidOn) : null,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lines,
    };
  }

  private where(q: SalesListQuery, user?: AuthUser): Record<string, unknown> {
    const and: Record<string, unknown>[] = [{ deletedAt: null }, this.scope(user)];
    const term = q.q?.trim();
    if (term) {
      const or: Record<string, unknown>[] = ['customerName', 'phone', 'nationality', 'destination', 'notes']
        .map((f) => ({ [f]: { contains: term, mode: 'insensitive' } }));
      // Hotel names, flights, transfers and services are on the lines.
      or.push({ lines: { some: { title: { contains: term, mode: 'insensitive' } } } });
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
    return { ...this.toItem(row), payments: row.payments.map((p) => this.paymentItem(p)) };
  }

  private checkDates(start: string | null | undefined, end: string | null | undefined) {
    if (start && end && end < start) {
      throw new ValidationError('The trip cannot end before it starts.', 'END_BEFORE_START');
    }
  }

  private lineRows(lines: SaleLineDto[]) {
    return lines.map((l, i) => {
      this.checkDates(l.startDate, l.endDate);
      const hotel = l.kind === 'HOTEL';
      return {
        position: i,
        kind: l.kind,
        title: clean(l.title) ?? null,
        startDate: toDbDate(l.startDate) ?? null,
        endDate: hotel ? toDbDate(l.endDate) ?? null : null,
        singleRooms: hotel ? l.singleRooms ?? 0 : 0,
        doubleRooms: hotel ? l.doubleRooms ?? 0 : 0,
        tripleRooms: hotel ? l.tripleRooms ?? 0 : 0,
        cost: l.cost ?? 0,
        sell: l.sell ?? 0,
        commission: l.kind === 'FLIGHT' ? l.commission ?? 0 : 0,
      };
    });
  }

  /** Trip dates left empty are taken from the lines: first day in, last day out. */
  private tripDates(dto: UpdateSaleDto, current: { startDate: string | null; endDate: string | null }) {
    const start = dto.startDate === undefined ? current.startDate : dto.startDate;
    const end = dto.endDate === undefined ? current.endDate : dto.endDate;
    const days = (dto.lines ?? []).flatMap((l) => [l.startDate, l.endDate]).filter((d): d is string => Boolean(d)).sort();
    return {
      startDate: start || days[0] || null,
      endDate: end || days[days.length - 1] || null,
    };
  }

  private data(dto: UpdateSaleDto) {
    return {
      status: dto.status,
      saleDate: dto.saleDate ? toDbDate(dto.saleDate)! : undefined,
      customerName: dto.customerName === undefined ? undefined : clean(dto.customerName)!,
      nationality: clean(dto.nationality),
      phone: clean(dto.phone),
      destination: clean(dto.destination),
      adults: dto.adults,
      children: dto.children,
      currency: dto.currency,
      sellerId: dto.sellerId === undefined ? undefined : dto.sellerId || null,
      commissionRate: dto.commissionRate,
      notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
    };
  }

  async create(dto: SaleDto, user: AuthUser): Promise<SaleDetail> {
    const trip = this.tripDates(dto, { startDate: null, endDate: null });
    this.checkDates(trip.startDate, trip.endDate);
    const data = this.data(dto);
    const sale = await this.prisma.sale.create({
      data: {
        ...data,
        startDate: toDbDate(trip.startDate),
        endDate: toDbDate(trip.endDate),
        saleDate: data.saleDate ?? toDbDate(todayIn(this.tz))!,
        customerName: data.customerName!,
        // The person entering the sale is the seller unless someone else is named.
        sellerId: data.sellerId === undefined ? user.id : data.sellerId,
        createdById: user.id,
        lines: { create: this.lineRows(dto.lines ?? []) },
      },
    });
    await this.activity.log({ type: 'SALE', id: sale.id, action: 'CREATED', userId: user.id });

    if (dto.initialPayment) await this.addPayment(sale.id, dto.initialPayment, user);
    return this.get(sale.id);
  }

  async update(id: string, dto: UpdateSaleDto, user: AuthUser): Promise<SaleDetail> {
    const before = this.toItem(await this.mustFind(id, user));
    const trip = this.tripDates(dto, before);
    this.checkDates(trip.startDate, trip.endDate);
    const data = { ...this.data(dto), startDate: toDbDate(trip.startDate), endDate: toDbDate(trip.endDate) };
    if (dto.lines) {
      const lines = this.lineRows(dto.lines);
      await this.prisma.$transaction([
        this.prisma.sale.update({ where: { id }, data }),
        this.prisma.saleLine.deleteMany({ where: { saleId: id } }),
        this.prisma.saleLine.createMany({ data: lines.map((l) => ({ ...l, saleId: id })) }),
      ]);
    } else {
      await this.prisma.sale.update({ where: { id }, data });
    }
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
