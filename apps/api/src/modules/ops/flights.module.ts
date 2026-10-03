import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import type { ListResponse, Status, FlightItem } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, skipTake, toCounts } from '../../common/list';
import { clean, fromDbDate, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import {
  OpsBaseDto, STATUS_LABEL, StatusDto, baseData, baseInclude, baseItem, baseWhere, nullableSort, orderBy, plainSort, searchWhere,
} from './ops-common';

export class FlightDto extends OpsBaseDto {
  @IsInt() @Min(1) @Max(999) @IsOptional()
  pax?: number;

  @IsString() @MaxLength(120) @IsOptional()
  fromPlace?: string | null;

  @IsString() @MaxLength(120) @IsOptional()
  toPlace?: string | null;

  @IsDateOnly() @IsOptional()
  travelDate?: string | null;

  @IsDateOnly() @IsOptional()
  returnDate?: string | null;

  @IsString() @MaxLength(100) @IsOptional()
  airline?: string | null;

  @IsString() @MaxLength(40) @IsOptional()
  flightNo?: string | null;

  /** Ticket number or booking reference (PNR). */
  @IsString() @MaxLength(60) @IsOptional()
  ticketNo?: string | null;

  @IsString() @MaxLength(60) @IsOptional()
  passportNo?: string | null;
}

export class UpdateFlightDto extends PartialType(FlightDto) {}

const include = baseInclude;

const TRACKED = [
  'status', 'guestName', 'nationality', 'phone', 'agency', 'pax', 'fromPlace', 'toPlace', 'travelDate', 'returnDate', 'airline', 'flightNo', 'ticketNo',
  'passportNo',
  'currency', 'cost', 'sell', 'notes',
] as const;

const SORTS = {
  travelDate: nullableSort('travelDate'),
  guestName: plainSort('guestName'),
  status: plainSort('status'),
  number: plainSort('number'),
  createdAt: plainSort('createdAt'),
  agency: (dir: 'asc' | 'desc') => ({ agency: { name: dir } }),
};

type Row = Awaited<ReturnType<FlightsService['findRow']>>;

@Injectable()
export class FlightsService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  findRow(id: string) {
    return this.prisma.flight.findFirst({ where: { id, deletedAt: null }, include });
  }

  toItem(row: NonNullable<Row>): FlightItem {
    return {
      ...baseItem('FLIGHT', row),
      pax: row.pax,
      fromPlace: row.fromPlace,
      toPlace: row.toPlace,
      travelDate: fromDbDate(row.travelDate),
      returnDate: fromDbDate(row.returnDate),
      airline: row.airline,
      flightNo: row.flightNo,
      ticketNo: row.ticketNo,
      passportNo: row.passportNo,
    };
  }

  private where(q: ListQueryDto): Record<string, unknown> {
    const and: Record<string, unknown>[] = [baseWhere(q)];
    const search = searchWhere(q.q, ['fromPlace', 'toPlace', 'passportNo', 'flightNo', 'ticketNo', 'airline']);
    if (search) and.push(search);
    const range = dateRange(q, todayIn(this.tz), todayIn(this.tz, 1));
    if (range) and.push({ travelDate: range });
    return { AND: and };
  }

  async list(q: ListQueryDto): Promise<ListResponse<FlightItem>> {
    const where = this.where(q);
    const filtered = q.status?.length ? { AND: [where, { status: { in: q.status } }] } : where;
    const dir = q.when === 'upcoming' || q.when === 'today' || q.when === 'tomorrow' ? 'asc' : 'desc';
    const fallback = [{ travelDate: { sort: dir, nulls: 'last' } }, { number: 'desc' }];
    const [rows, total, groups] = await Promise.all([
      this.prisma.flight.findMany({ where: filtered, include, orderBy: orderBy(q, SORTS, fallback), ...skipTake(q) }),
      this.prisma.flight.count({ where: filtered }),
      this.prisma.flight.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), total, page: q.page, pageSize: q.pageSize, counts: toCounts(groups) };
  }

  private async mustFind(id: string): Promise<NonNullable<Row>> {
    const row = await this.findRow(id);
    if (!row) throw new NotFoundError('Flight', id);
    return row;
  }

  async get(id: string): Promise<FlightItem> {
    return this.toItem(await this.mustFind(id));
  }

  private data(dto: UpdateFlightDto) {
    return {
      ...baseData(dto),
      pax: dto.pax,
      fromPlace: clean(dto.fromPlace),
      toPlace: clean(dto.toPlace),
      travelDate: toDbDate(dto.travelDate),
      returnDate: toDbDate(dto.returnDate),
      airline: clean(dto.airline),
      flightNo: clean(dto.flightNo)?.toUpperCase() ?? (dto.flightNo === undefined ? undefined : null),
      ticketNo: clean(dto.ticketNo),
      passportNo: clean(dto.passportNo),
    };
  }

  private checkDates(travel: string | null | undefined, back: string | null | undefined) {
    if (travel && back && back < travel) {
      throw new ValidationError('The return cannot be before the way there.', 'RETURN_BEFORE_OUTBOUND');
    }
  }

  async create(dto: FlightDto, user: AuthUser): Promise<FlightItem> {
    this.checkDates(dto.travelDate, dto.returnDate);
    const data = this.data(dto);
    const row = await this.prisma.flight.create({
      data: { ...data, guestName: data.guestName!, createdById: user.id },
      include,
    });
    await this.activity.log({ type: 'FLIGHT', id: row.id, action: 'CREATED', userId: user.id });
    return this.toItem(row);
  }

  async update(id: string, dto: UpdateFlightDto, user: AuthUser): Promise<FlightItem> {
    const before = this.toItem(await this.mustFind(id));
    this.checkDates(
      dto.travelDate === undefined ? before.travelDate : dto.travelDate,
      dto.returnDate === undefined ? before.returnDate : dto.returnDate,
    );
    const row = await this.prisma.flight.update({ where: { id }, data: this.data(dto), include });
    const after = this.toItem(row);
    const changes = this.activity.diff(snapshot(before), snapshot(after), TRACKED);
    if (changes) await this.activity.log({ type: 'FLIGHT', id, action: 'UPDATED', userId: user.id, changes });
    return after;
  }

  async setStatus(id: string, status: Status, user: AuthUser): Promise<FlightItem> {
    const before = await this.mustFind(id);
    if (before.status === status) return this.toItem(before);
    const row = await this.prisma.flight.update({ where: { id }, data: { status }, include });
    await this.activity.log({
      type: 'FLIGHT', id, action: 'STATUS', userId: user.id,
      summary: `${STATUS_LABEL[before.status]} → ${STATUS_LABEL[status]}`,
      changes: { status: { from: before.status, to: status } },
    });
    return this.toItem(row);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id);
    await this.prisma.flight.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log({ type: 'FLIGHT', id, action: 'DELETED', userId: user.id });
  }

  async export(q: ListQueryDto, res: Response): Promise<void> {
    const { data } = await this.list(Object.assign(new ListQueryDto(), q, { page: 1, pageSize: 5000 }));
    await sendWorkbook(res, `flights-${todayIn(this.tz)}.xlsx`, 'Flights', [
      { header: 'REF', width: 9, value: (v) => v.ref },
      { header: 'NAME', width: 26, value: (v) => v.guestName },
      { header: 'PHONE', value: (v) => v.phone },
      { header: 'FROM', value: (v) => v.fromPlace },
      { header: 'TO', value: (v) => v.toPlace },
      { header: 'PAXS', width: 7, value: (v) => v.pax },
      { header: 'NATIONALITY', value: (v) => v.nationality },
      { header: 'DATE', width: 12, value: (v) => v.travelDate },
      { header: 'RETURN', width: 12, value: (v) => v.returnDate },
      { header: 'AIRLINE', width: 16, value: (v) => v.airline },
      { header: 'FLIGHT NUMBER', value: (v) => v.flightNo },
      { header: 'TICKET / PNR', width: 16, value: (v) => v.ticketNo },
      { header: 'TRAVEL AGENCY', width: 18, value: (v) => v.agency?.name },
      { header: 'PASSPORT', value: (v) => v.passportNo },
      { header: 'STATUS', width: 12, value: (v) => STATUS_LABEL[v.status] },
      { header: 'CURRENCY', width: 9, value: (v) => v.currency },
      { header: 'COST', value: (v) => v.cost },
      { header: 'SELL', value: (v) => v.sell },
      { header: 'NOTES', width: 30, value: (v) => v.notes },
    ], data);
  }
}

function snapshot(v: FlightItem): Record<string, unknown> {
  return { ...v, agency: v.agency?.name ?? null };
}

@ApiTags('flights')
@ApiBearerAuth()
@Roles('OPERATIONS')
@Controller({ path: 'flights', version: '1' })
export class FlightsController {
  constructor(
    private readonly service: FlightsService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.service.list(q);
  }

  @Get('export')
  export(@Query() q: ListQueryDto, @Res() res: Response) {
    return this.service.export(q, res);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Get(':id/activity')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.activity.list('FLIGHT', id);
  }

  @Post()
  create(@Body() dto: FlightDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFlightDto, @CurrentUser() user: AuthUser) {
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
