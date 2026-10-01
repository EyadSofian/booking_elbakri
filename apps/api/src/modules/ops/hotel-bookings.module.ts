import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { countNights, hotelOwed, hotelPaymentDue, type HotelBookingItem, type ListResponse, type Status } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, skipTake, toCounts } from '../../common/list';
import { clean, fromDbDate, num, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import {
  OpsBaseDto, STATUS_LABEL, StatusDto, baseData, baseInclude, baseItem, baseWhere, nullableSort, orderBy, plainSort, searchWhere,
} from './ops-common';

export class HotelBookingDto extends OpsBaseDto {
  @IsUUID() @IsOptional()
  hotelId?: string | null;

  /** When no hotel is picked, the hotel with this name — added if new. */
  @IsString() @MaxLength(160) @IsOptional()
  hotelName?: string;

  @IsDateOnly() @IsOptional()
  checkIn?: string | null;

  @IsDateOnly() @IsOptional()
  checkOut?: string | null;

  @IsString() @MaxLength(200) @IsOptional()
  rooms?: string | null;

  @IsString() @MaxLength(100) @IsOptional()
  mealPlan?: string | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  adults?: number | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  children?: number | null;

  @IsDateOnly() @IsOptional()
  bookingDate?: string | null;

  @IsString() @MaxLength(100) @IsOptional()
  confirmationNo?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
  paidToHotel?: number | null;

  @IsDateOnly() @IsOptional()
  hotelPaidOn?: string | null;
}

export class UpdateHotelBookingDto extends PartialType(HotelBookingDto) {}

export class HotelListQuery extends ListQueryDto {
  @IsUUID() @IsOptional()
  hotelId?: string;

  /** `due`: the hotel is still owed money — the Payments tab, soonest first. */
  @IsIn(['due']) @IsOptional()
  payment?: 'due';

  /** Guests checking out today or tomorrow. */
  @IsIn(['today', 'tomorrow']) @IsOptional()
  departing?: 'today' | 'tomorrow';
}

const include = { ...baseInclude, hotel: { select: { id: true, name: true, city: true } } } as const;

const TRACKED = [
  'status', 'guestName', 'nationality', 'phone', 'agency', 'hotel', 'checkIn', 'checkOut', 'rooms', 'mealPlan',
  'adults', 'children', 'bookingDate', 'confirmationNo', 'currency', 'cost', 'sell', 'paidToHotel', 'hotelPaidOn', 'notes',
] as const;

const SORTS = {
  checkIn: nullableSort('checkIn'),
  checkOut: nullableSort('checkOut'),
  guestName: plainSort('guestName'),
  bookingDate: nullableSort('bookingDate'),
  status: plainSort('status'),
  number: plainSort('number'),
  createdAt: plainSort('createdAt'),
  hotel: (dir: 'asc' | 'desc') => ({ hotel: { name: dir } }),
  agency: (dir: 'asc' | 'desc') => ({ agency: { name: dir } }),
};

type Row = Awaited<ReturnType<HotelBookingsService['findRow']>>;

@Injectable()
export class HotelBookingsService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  findRow(id: string) {
    return this.prisma.hotelBooking.findFirst({ where: { id, deletedAt: null }, include });
  }

  toItem(row: NonNullable<Row>): HotelBookingItem {
    const checkIn = fromDbDate(row.checkIn);
    const checkOut = fromDbDate(row.checkOut);
    return {
      ...baseItem('HOTEL', row),
      hotel: row.hotel,
      checkIn,
      checkOut,
      nights: countNights(checkIn, checkOut),
      rooms: row.rooms,
      mealPlan: row.mealPlan,
      adults: row.adults,
      children: row.children,
      bookingDate: fromDbDate(row.bookingDate),
      confirmationNo: row.confirmationNo,
      paidToHotel: num(row.paidToHotel),
      hotelPaidOn: fromDbDate(row.hotelPaidOn),
    };
  }

  private where(q: HotelListQuery): Record<string, unknown> {
    const today = todayIn(this.tz);
    const and: Record<string, unknown>[] = [baseWhere(q)];
    const search = searchWhere(q.q, ['rooms', 'mealPlan', 'confirmationNo'], (term) => [
      { hotel: { name: { contains: term, mode: 'insensitive' } } },
    ]);
    if (search) and.push(search);
    if (q.hotelId) and.push({ hotelId: q.hotelId });
    if (q.departing) {
      and.push({ checkOut: new Date(`${q.departing === 'today' ? today : todayIn(this.tz, 1)}T00:00:00Z`) });
    }

    // Money owed to a hotel matters whatever the stay dates, so no date filter.
    if (q.payment === 'due') and.push({ cost: { gt: 0 } }, { status: { not: 'CANCELLED' } });
    // For hotels, "upcoming" keeps guests who are still in the hotel.
    else if (q.when === 'upcoming') and.push({ checkOut: { gte: new Date(`${today}T00:00:00Z`) } });
    else if (q.when === 'past') and.push({ checkOut: { lt: new Date(`${today}T00:00:00Z`) } });
    else {
      const range = dateRange(q, today, todayIn(this.tz, 1));
      if (range) and.push({ checkIn: range });
    }
    return { AND: and };
  }

  /**
   * Bookings the hotel is still owed money on, the soonest payment first.
   * "Still owed" compares two columns, so it is filtered after reading.
   */
  async paymentsDue(q: HotelListQuery = new HotelListQuery()): Promise<HotelBookingItem[]> {
    const where = this.where(Object.assign(new HotelListQuery(), q, { payment: 'due', status: undefined }));
    const rows = await this.prisma.hotelBooking.findMany({ where, include });
    return rows
      .map((r) => this.toItem(r))
      .filter((b) => (hotelOwed(b) ?? 0) > 0)
      .sort((a, b) => (hotelPaymentDue(a) ?? '9999').localeCompare(hotelPaymentDue(b) ?? '9999') || a.number - b.number);
  }

  async list(q: HotelListQuery): Promise<ListResponse<HotelBookingItem>> {
    const due = await this.paymentsDue(q);
    const extraCounts = { PAYMENT: due.length };

    if (q.payment === 'due') {
      const { skip, take } = skipTake(q);
      const base = this.where(Object.assign(new HotelListQuery(), q, { payment: undefined }));
      const groups = await this.prisma.hotelBooking.groupBy({ by: ['status'], where: base, _count: { _all: true } });
      return { data: due.slice(skip, skip + take), total: due.length, page: q.page, pageSize: q.pageSize, counts: toCounts(groups), extraCounts };
    }

    const where = this.where(q);
    const filtered = q.status?.length ? { AND: [where, { status: { in: q.status } }] } : where;
    const fallback =
      q.when === 'upcoming' || q.when === 'today' || q.when === 'tomorrow'
        ? [{ checkIn: { sort: 'asc', nulls: 'last' } }, { number: 'desc' }]
        : [{ checkIn: { sort: 'desc', nulls: 'last' } }, { number: 'desc' }];
    const [rows, total, groups] = await Promise.all([
      this.prisma.hotelBooking.findMany({ where: filtered, include, orderBy: orderBy(q, SORTS, fallback), ...skipTake(q) }),
      this.prisma.hotelBooking.count({ where: filtered }),
      this.prisma.hotelBooking.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), total, page: q.page, pageSize: q.pageSize, counts: toCounts(groups), extraCounts };
  }

  private async mustFind(id: string): Promise<NonNullable<Row>> {
    const row = await this.findRow(id);
    if (!row) throw new NotFoundError('Hotel booking', id);
    return row;
  }

  async get(id: string): Promise<HotelBookingItem> {
    return this.toItem(await this.mustFind(id));
  }

  private checkDates(checkIn: string | null | undefined, checkOut: string | null | undefined) {
    if (checkIn && checkOut && checkOut < checkIn) {
      throw new ValidationError('Check-out cannot be before check-in.', 'CHECKOUT_BEFORE_CHECKIN');
    }
  }

  private data(dto: UpdateHotelBookingDto) {
    return {
      ...baseData(dto),
      hotelId: dto.hotelId === undefined ? undefined : dto.hotelId || null,
      checkIn: toDbDate(dto.checkIn),
      checkOut: toDbDate(dto.checkOut),
      rooms: clean(dto.rooms),
      mealPlan: clean(dto.mealPlan),
      adults: dto.adults,
      children: dto.children,
      bookingDate: toDbDate(dto.bookingDate),
      confirmationNo: clean(dto.confirmationNo),
      paidToHotel: dto.paidToHotel,
      hotelPaidOn: toDbDate(dto.hotelPaidOn),
    };
  }

  /** Finds the hotel by name (any spelling case), adding it when it is new. */
  private async hotelByName(name: string | undefined): Promise<string | undefined> {
    const clean = name?.replace(/\s+/g, ' ').trim();
    if (!clean) return undefined;
    const found =
      (await this.prisma.hotel.findFirst({ where: { name: { equals: clean, mode: 'insensitive' } } })) ??
      (await this.prisma.hotel.create({ data: { name: clean } }));
    return found.id;
  }

  async create(dto: HotelBookingDto, user: AuthUser): Promise<HotelBookingItem> {
    this.checkDates(dto.checkIn, dto.checkOut);
    const data = this.data(dto);
    if (!data.hotelId) data.hotelId = (await this.hotelByName(dto.hotelName)) ?? data.hotelId;
    const row = await this.prisma.hotelBooking.create({
      data: {
        ...data,
        guestName: data.guestName!,
        bookingDate: data.bookingDate ?? toDbDate(todayIn(this.tz)),
        createdById: user.id,
      },
      include,
    });
    await this.activity.log({ type: 'HOTEL', id: row.id, action: 'CREATED', userId: user.id });
    return this.toItem(row);
  }

  async update(id: string, dto: UpdateHotelBookingDto, user: AuthUser): Promise<HotelBookingItem> {
    const before = this.toItem(await this.mustFind(id));
    this.checkDates(
      dto.checkIn === undefined ? before.checkIn : dto.checkIn,
      dto.checkOut === undefined ? before.checkOut : dto.checkOut,
    );
    const data = this.data(dto);
    if (!data.hotelId && dto.hotelName) data.hotelId = await this.hotelByName(dto.hotelName);
    const row = await this.prisma.hotelBooking.update({ where: { id }, data, include });
    const after = this.toItem(row);
    const changes = this.activity.diff(snapshot(before), snapshot(after), TRACKED);
    if (changes) await this.activity.log({ type: 'HOTEL', id, action: 'UPDATED', userId: user.id, changes });
    return after;
  }

  async setStatus(id: string, status: Status, user: AuthUser): Promise<HotelBookingItem> {
    const before = await this.mustFind(id);
    if (before.status === status) return this.toItem(before);
    const row = await this.prisma.hotelBooking.update({ where: { id }, data: { status }, include });
    await this.activity.log({
      type: 'HOTEL', id, action: 'STATUS', userId: user.id,
      summary: `${STATUS_LABEL[before.status]} → ${STATUS_LABEL[status]}`,
      changes: { status: { from: before.status, to: status } },
    });
    return this.toItem(row);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id);
    await this.prisma.hotelBooking.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log({ type: 'HOTEL', id, action: 'DELETED', userId: user.id });
  }

  async export(q: HotelListQuery, res: Response): Promise<void> {
    const { data } = await this.list(Object.assign(new HotelListQuery(), q, { page: 1, pageSize: 5000 }));
    await sendWorkbook(res, `hotel-bookings-${todayIn(this.tz)}.xlsx`, 'Hotels', [
      { header: 'REF', width: 9, value: (b) => b.ref },
      { header: 'NAME', width: 26, value: (b) => b.guestName },
      { header: 'NATIONALITY', value: (b) => b.nationality },
      { header: 'PHONE', value: (b) => b.phone },
      { header: 'CHECK IN', width: 12, value: (b) => b.checkIn },
      { header: 'CHECK OUT', width: 12, value: (b) => b.checkOut },
      { header: 'NIGHTS', width: 8, value: (b) => b.nights },
      { header: 'HOTEL', width: 28, value: (b) => b.hotel?.name },
      { header: 'TYPE ROOM', width: 20, value: (b) => b.rooms },
      { header: 'MEAL PLAN', width: 18, value: (b) => b.mealPlan },
      { header: 'BOOKING DATE', width: 13, value: (b) => b.bookingDate },
      { header: 'TRAVEL AGENCY', width: 18, value: (b) => b.agency?.name },
      { header: 'STATUS', width: 12, value: (b) => STATUS_LABEL[b.status] },
      { header: 'CONFIRMATION', value: (b) => b.confirmationNo },
      { header: 'CURRENCY', width: 9, value: (b) => b.currency },
      { header: 'TOTAL PAYMENT', value: (b) => b.cost },
      { header: 'PAID', value: (b) => b.paidToHotel },
      { header: 'REST', value: (b) => hotelOwed(b) },
      { header: 'DATE OF PAYMENT', width: 13, value: (b) => b.hotelPaidOn },
      { header: 'SELL', value: (b) => b.sell },
      { header: 'NOTES', width: 30, value: (b) => b.notes },
    ], data);
  }
}

function snapshot(b: HotelBookingItem): Record<string, unknown> {
  return { ...b, agency: b.agency?.name ?? null, hotel: b.hotel?.name ?? null };
}

@ApiTags('hotel-bookings')
@ApiBearerAuth()
@Roles('OPERATIONS')
@Controller({ path: 'hotel-bookings', version: '1' })
export class HotelBookingsController {
  constructor(
    private readonly service: HotelBookingsService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  list(@Query() q: HotelListQuery) {
    return this.service.list(q);
  }

  @Get('export')
  export(@Query() q: HotelListQuery, @Res() res: Response) {
    return this.service.export(q, res);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Get(':id/activity')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.activity.list('HOTEL', id);
  }

  @Post()
  create(@Body() dto: HotelBookingDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHotelBookingDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentUser() user: AuthUser) {
    return this.service.setStatus(id, dto.status, user);
  }

  @Roles('OPERATIONS')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
