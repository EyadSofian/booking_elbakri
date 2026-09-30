import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { Response } from 'express';
import { TRANSFER_KINDS, formatRef, type ListResponse, type Status, type TransferItem, type TransferKind } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, skipTake, toCounts } from '../../common/list';
import { clean, cleanTime, fromDbDate, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import {
  OpsBaseDto, STATUS_LABEL, StatusDto, baseData, defaultAgencyId, baseInclude, baseItem, baseWhere, nullableSort, orderBy, plainSort, searchWhere,
} from './ops-common';

export class TransferDto extends OpsBaseDto {
  @IsIn(TRANSFER_KINDS) @IsOptional()
  kind?: TransferKind;

  @IsDateOnly() @IsOptional()
  date?: string | null;

  @IsString() @MaxLength(20) @IsOptional()
  time?: string | null;

  @IsString() @MaxLength(200) @IsOptional()
  fromPlace?: string | null;

  @IsString() @MaxLength(200) @IsOptional()
  toPlace?: string | null;

  @IsString() @MaxLength(40) @IsOptional()
  flightNo?: string | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  adults?: number | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  children?: number | null;

  @IsString() @MaxLength(100) @IsOptional()
  vehicle?: string | null;

  @IsString() @MaxLength(100) @IsOptional()
  driverName?: string | null;

  @IsString() @MaxLength(60) @IsOptional()
  driverPhone?: string | null;
}

export class UpdateTransferDto extends PartialType(TransferDto) {}

/** The way back, entered on the same form as the way there. */
class ReturnLegDto {
  @IsDateOnly()
  date!: string;

  @IsString() @MaxLength(20) @IsOptional()
  time?: string | null;

  @IsString() @MaxLength(40) @IsOptional()
  flightNo?: string | null;
}

export class CreateTransferDto extends TransferDto {
  /** Round trip: also records the return leg, places swapped. */
  @ValidateNested() @Type(() => ReturnLegDto) @IsOptional()
  returnTrip?: ReturnLegDto;
}

export class TransferListQuery extends ListQueryDto {
  @IsIn(TRANSFER_KINDS) @IsOptional()
  kind?: TransferKind;

  /** `no`: still waiting for a driver. */
  @IsIn(['no', 'yes']) @IsOptional()
  assigned?: 'no' | 'yes';
}

const AIRPORT = /air\s?port|airpor|مطار|\b(ssh|hrg|cai|rmf|hbe|lxr|asw)\b/i;

/** Arrival when the car leaves an airport, departure when it heads to one. */
export function guessKind(from?: string | null, to?: string | null): TransferKind {
  if (from && AIRPORT.test(from)) return 'ARRIVAL';
  if (to && AIRPORT.test(to)) return 'DEPARTURE';
  return 'TRANSFER';
}

const include = baseInclude;

const TRACKED = [
  'status', 'kind', 'guestName', 'nationality', 'phone', 'agency', 'date', 'time', 'fromPlace', 'toPlace', 'flightNo',
  'adults', 'children', 'vehicle', 'driverName', 'driverPhone', 'currency', 'cost', 'sell', 'notes', 'sale',
] as const;

const SORTS = {
  date: (dir: 'asc' | 'desc') => ({ date: { sort: dir, nulls: 'last' } }),
  time: nullableSort('time'),
  guestName: plainSort('guestName'),
  status: plainSort('status'),
  number: plainSort('number'),
  createdAt: plainSort('createdAt'),
  agency: (dir: 'asc' | 'desc') => ({ agency: { name: dir } }),
};

type Row = Awaited<ReturnType<TransfersService['findRow']>>;

@Injectable()
export class TransfersService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  findRow(id: string) {
    return this.prisma.transfer.findFirst({ where: { id, deletedAt: null }, include });
  }

  toItem(row: NonNullable<Row>): TransferItem {
    return {
      ...baseItem('TRANSFER', row),
      kind: row.kind,
      date: fromDbDate(row.date),
      time: row.time,
      fromPlace: row.fromPlace,
      toPlace: row.toPlace,
      flightNo: row.flightNo,
      adults: row.adults,
      children: row.children,
      vehicle: row.vehicle,
      driverName: row.driverName,
      driverPhone: row.driverPhone,
    };
  }

  private where(q: TransferListQuery): Record<string, unknown> {
    const and: Record<string, unknown>[] = [baseWhere(q)];
    const search = searchWhere(q.q, ['fromPlace', 'toPlace', 'flightNo', 'driverName', 'vehicle']);
    if (search) and.push(search);
    if (q.kind) and.push({ kind: q.kind });
    if (q.assigned === 'no') and.push({ driverName: null }, { status: { notIn: ['CANCELLED', 'DONE'] } });
    if (q.assigned === 'yes') and.push({ driverName: { not: null } });
    const range = dateRange(q, todayIn(this.tz), todayIn(this.tz, 1));
    if (range) and.push({ date: range });
    return { AND: and };
  }

  async list(q: TransferListQuery): Promise<ListResponse<TransferItem>> {
    const where = this.where(q);
    const filtered = q.status?.length ? { AND: [where, { status: { in: q.status } }] } : where;
    const dir = q.when === 'upcoming' || q.when === 'today' || q.when === 'tomorrow' ? 'asc' : 'desc';
    const fallback = [{ date: { sort: dir, nulls: 'last' } }, { time: { sort: dir, nulls: 'last' } }, { number: 'desc' }];
    const [rows, total, groups] = await Promise.all([
      this.prisma.transfer.findMany({ where: filtered, include, orderBy: orderBy(q, SORTS, fallback), ...skipTake(q) }),
      this.prisma.transfer.count({ where: filtered }),
      this.prisma.transfer.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), total, page: q.page, pageSize: q.pageSize, counts: toCounts(groups) };
  }

  private async mustFind(id: string): Promise<NonNullable<Row>> {
    const row = await this.findRow(id);
    if (!row) throw new NotFoundError('Transfer', id);
    return row;
  }

  async get(id: string): Promise<TransferItem> {
    return this.toItem(await this.mustFind(id));
  }

  private data(dto: UpdateTransferDto) {
    return {
      ...baseData(dto),
      kind: dto.kind,
      date: toDbDate(dto.date),
      time: cleanTime(dto.time),
      fromPlace: clean(dto.fromPlace),
      toPlace: clean(dto.toPlace),
      flightNo: clean(dto.flightNo)?.toUpperCase() ?? (dto.flightNo === undefined ? undefined : null),
      adults: dto.adults,
      children: dto.children,
      vehicle: clean(dto.vehicle),
      driverName: clean(dto.driverName),
      driverPhone: clean(dto.driverPhone),
    };
  }

  async create(dto: CreateTransferDto, user: AuthUser): Promise<TransferItem> {
    const { returnTrip, ...rest } = dto;
    if (returnTrip && dto.date && returnTrip.date < dto.date) {
      throw new ValidationError('The return cannot be before the way there.', 'RETURN_BEFORE_OUTBOUND');
    }
    const data = this.data(rest);
    data.agencyId = data.agencyId ?? (await defaultAgencyId(this.prisma, dto));
    const kind = data.kind ?? guessKind(data.fromPlace, data.toPlace);
    const outbound = { ...data, guestName: data.guestName!, kind, createdById: user.id };

    if (!returnTrip) {
      const row = await this.prisma.transfer.create({ data: outbound, include });
      await this.activity.log({ type: 'TRANSFER', id: row.id, action: 'CREATED', userId: user.id });
      return this.toItem(row);
    }

    // Round trip: two transfers, because each leg has its own day and driver.
    // The price stays on the way there so it is not counted twice.
    const [there, back] = await this.prisma.$transaction([
      this.prisma.transfer.create({ data: outbound, include }),
      this.prisma.transfer.create({
        data: {
          ...outbound,
          kind: kind === 'ARRIVAL' ? 'DEPARTURE' : kind === 'DEPARTURE' ? 'ARRIVAL' : 'TRANSFER',
          fromPlace: outbound.toPlace,
          toPlace: outbound.fromPlace,
          date: toDbDate(returnTrip.date),
          time: cleanTime(returnTrip.time) ?? null,
          flightNo: clean(returnTrip.flightNo)?.toUpperCase() ?? null,
          driverName: null,
          driverPhone: null,
          vehicle: null,
          cost: null,
          sell: null,
        },
        include,
      }),
    ]);
    const pair = `${formatRef('TRANSFER', there.number)} ⇄ ${formatRef('TRANSFER', back.number)}`;
    await this.activity.log({ type: 'TRANSFER', id: there.id, action: 'CREATED', userId: user.id, summary: pair });
    await this.activity.log({ type: 'TRANSFER', id: back.id, action: 'CREATED', userId: user.id, summary: pair });
    return this.toItem(there);
  }

  async update(id: string, dto: UpdateTransferDto, user: AuthUser): Promise<TransferItem> {
    const before = this.toItem(await this.mustFind(id));
    const row = await this.prisma.transfer.update({ where: { id }, data: this.data(dto), include });
    const after = this.toItem(row);
    const changes = this.activity.diff(snapshot(before), snapshot(after), TRACKED);
    if (changes) await this.activity.log({ type: 'TRANSFER', id, action: 'UPDATED', userId: user.id, changes });
    return after;
  }

  async setStatus(id: string, status: Status, user: AuthUser): Promise<TransferItem> {
    const before = await this.mustFind(id);
    if (before.status === status) return this.toItem(before);
    const row = await this.prisma.transfer.update({ where: { id }, data: { status }, include });
    await this.activity.log({
      type: 'TRANSFER', id, action: 'STATUS', userId: user.id,
      summary: `${STATUS_LABEL[before.status]} → ${STATUS_LABEL[status]}`,
      changes: { status: { from: before.status, to: status } },
    });
    return this.toItem(row);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id);
    await this.prisma.transfer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log({ type: 'TRANSFER', id, action: 'DELETED', userId: user.id });
  }

  async export(q: TransferListQuery, res: Response): Promise<void> {
    const { data } = await this.list(Object.assign(new TransferListQuery(), q, { page: 1, pageSize: 5000 }));
    const pax = (t: TransferItem) =>
      t.adults == null && t.children == null ? null : t.children ? `${t.adults ?? 0} + ${t.children} CH` : t.adults;
    await sendWorkbook(res, `transfers-${todayIn(this.tz)}.xlsx`, 'Transfers', [
      { header: 'REF', width: 9, value: (t) => t.ref },
      { header: 'NAME', width: 26, value: (t) => t.guestName },
      { header: 'PHONE', value: (t) => t.phone },
      { header: 'FROM', width: 26, value: (t) => t.fromPlace },
      { header: 'TO', width: 26, value: (t) => t.toPlace },
      { header: 'PAXS', width: 10, value: pax },
      { header: 'NATIONALITY', value: (t) => t.nationality },
      { header: 'DATE', width: 12, value: (t) => t.date },
      { header: 'FLIGHT NUMBER', value: (t) => t.flightNo },
      { header: 'PICKUP', width: 9, value: (t) => t.time },
      { header: 'TRAVEL AGENCY', width: 18, value: (t) => t.agency?.name },
      { header: 'TYPE', width: 11, value: (t) => t.kind },
      { header: 'DRIVER', value: (t) => t.driverName },
      { header: 'DRIVER PHONE', value: (t) => t.driverPhone },
      { header: 'VEHICLE', value: (t) => t.vehicle },
      { header: 'STATUS', width: 12, value: (t) => STATUS_LABEL[t.status] },
      { header: 'CURRENCY', width: 9, value: (t) => t.currency },
      { header: 'COST', value: (t) => t.cost },
      { header: 'SELL', value: (t) => t.sell },
      { header: 'NOTES', width: 30, value: (t) => t.notes },
    ], data);
  }
}

function snapshot(t: TransferItem): Record<string, unknown> {
  return { ...t, agency: t.agency?.name ?? null, sale: t.sale?.ref ?? null };
}

@ApiTags('transfers')
@ApiBearerAuth()
@Controller({ path: 'transfers', version: '1' })
export class TransfersController {
  constructor(
    private readonly service: TransfersService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  list(@Query() q: TransferListQuery) {
    return this.service.list(q);
  }

  @Get('export')
  export(@Query() q: TransferListQuery, @Res() res: Response) {
    return this.service.export(q, res);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Get(':id/activity')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.activity.list('TRANSFER', id);
  }

  @Post()
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransferDto, @CurrentUser() user: AuthUser) {
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
