import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Response } from 'express';
import type { ExcursionItem, ListResponse, Status } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, skipTake, toCounts } from '../../common/list';
import { clean, cleanTime, fromDbDate, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import {
  OpsBaseDto, STATUS_LABEL, StatusDto, baseData, defaultAgencyId, baseInclude, baseItem, baseWhere, nullableSort, orderBy, plainSort, searchWhere,
} from './ops-common';

export class ExcursionDto extends OpsBaseDto {
  @IsString() @MinLength(1) @MaxLength(300)
  activity!: string;

  @IsString() @MaxLength(200) @IsOptional()
  hotelName?: string | null;

  @IsDateOnly() @IsOptional()
  date?: string | null;

  @IsString() @MaxLength(20) @IsOptional()
  time?: string | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  adults?: number | null;

  @IsInt() @Min(0) @Max(999) @IsOptional()
  children?: number | null;
}

export class UpdateExcursionDto extends PartialType(ExcursionDto) {}

const include = baseInclude;

const TRACKED = [
  'status', 'guestName', 'nationality', 'phone', 'agency', 'activity', 'hotelName', 'date', 'time',
  'adults', 'children', 'currency', 'cost', 'sell', 'notes', 'sale',
] as const;

const SORTS = {
  date: nullableSort('date'),
  time: nullableSort('time'),
  guestName: plainSort('guestName'),
  activity: plainSort('activity'),
  status: plainSort('status'),
  number: plainSort('number'),
  createdAt: plainSort('createdAt'),
  agency: (dir: 'asc' | 'desc') => ({ agency: { name: dir } }),
};

type Row = Awaited<ReturnType<ExcursionsService['findRow']>>;

@Injectable()
export class ExcursionsService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  findRow(id: string) {
    return this.prisma.excursion.findFirst({ where: { id, deletedAt: null }, include });
  }

  toItem(row: NonNullable<Row>): ExcursionItem {
    return {
      ...baseItem('EXCURSION', row),
      activity: row.activity,
      hotelName: row.hotelName,
      date: fromDbDate(row.date),
      time: row.time,
      adults: row.adults,
      children: row.children,
    };
  }

  private where(q: ListQueryDto): Record<string, unknown> {
    const and: Record<string, unknown>[] = [baseWhere(q)];
    const search = searchWhere(q.q, ['activity', 'hotelName']);
    if (search) and.push(search);
    const range = dateRange(q, todayIn(this.tz), todayIn(this.tz, 1));
    if (range) and.push({ date: range });
    return { AND: and };
  }

  async list(q: ListQueryDto): Promise<ListResponse<ExcursionItem>> {
    const where = this.where(q);
    const filtered = q.status?.length ? { AND: [where, { status: { in: q.status } }] } : where;
    const dir = q.when === 'upcoming' || q.when === 'today' || q.when === 'tomorrow' ? 'asc' : 'desc';
    const fallback = [{ date: { sort: dir, nulls: 'last' } }, { time: { sort: dir, nulls: 'last' } }, { number: 'desc' }];
    const [rows, total, groups] = await Promise.all([
      this.prisma.excursion.findMany({ where: filtered, include, orderBy: orderBy(q, SORTS, fallback), ...skipTake(q) }),
      this.prisma.excursion.count({ where: filtered }),
      this.prisma.excursion.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), total, page: q.page, pageSize: q.pageSize, counts: toCounts(groups) };
  }

  private async mustFind(id: string): Promise<NonNullable<Row>> {
    const row = await this.findRow(id);
    if (!row) throw new NotFoundError('Excursion', id);
    return row;
  }

  async get(id: string): Promise<ExcursionItem> {
    return this.toItem(await this.mustFind(id));
  }

  private data(dto: UpdateExcursionDto) {
    return {
      ...baseData(dto),
      activity: dto.activity === undefined ? undefined : clean(dto.activity)!,
      hotelName: clean(dto.hotelName),
      date: toDbDate(dto.date),
      time: cleanTime(dto.time),
      adults: dto.adults,
      children: dto.children,
    };
  }

  async create(dto: ExcursionDto, user: AuthUser): Promise<ExcursionItem> {
    const data = this.data(dto);
    data.agencyId = data.agencyId ?? (await defaultAgencyId(this.prisma, dto));
    const row = await this.prisma.excursion.create({
      data: { ...data, guestName: data.guestName!, activity: data.activity!, createdById: user.id },
      include,
    });
    await this.activity.log({ type: 'EXCURSION', id: row.id, action: 'CREATED', userId: user.id });
    return this.toItem(row);
  }

  async update(id: string, dto: UpdateExcursionDto, user: AuthUser): Promise<ExcursionItem> {
    const before = this.toItem(await this.mustFind(id));
    const row = await this.prisma.excursion.update({ where: { id }, data: this.data(dto), include });
    const after = this.toItem(row);
    const changes = this.activity.diff(snapshot(before), snapshot(after), TRACKED);
    if (changes) await this.activity.log({ type: 'EXCURSION', id, action: 'UPDATED', userId: user.id, changes });
    return after;
  }

  async setStatus(id: string, status: Status, user: AuthUser): Promise<ExcursionItem> {
    const before = await this.mustFind(id);
    if (before.status === status) return this.toItem(before);
    const row = await this.prisma.excursion.update({ where: { id }, data: { status }, include });
    await this.activity.log({
      type: 'EXCURSION', id, action: 'STATUS', userId: user.id,
      summary: `${STATUS_LABEL[before.status]} → ${STATUS_LABEL[status]}`,
      changes: { status: { from: before.status, to: status } },
    });
    return this.toItem(row);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id);
    await this.prisma.excursion.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log({ type: 'EXCURSION', id, action: 'DELETED', userId: user.id });
  }

  async export(q: ListQueryDto, res: Response): Promise<void> {
    const { data } = await this.list(Object.assign(new ListQueryDto(), q, { page: 1, pageSize: 5000 }));
    await sendWorkbook(res, `excursions-${todayIn(this.tz)}.xlsx`, 'Excursions', [
      { header: 'REF', width: 9, value: (x) => x.ref },
      { header: 'NAME', width: 26, value: (x) => x.guestName },
      { header: 'PAXS', width: 7, value: (x) => x.adults },
      { header: 'CHILD', width: 7, value: (x) => x.children },
      { header: 'PHONE', value: (x) => x.phone },
      { header: 'NATIONALITY', value: (x) => x.nationality },
      { header: 'HOTEL', width: 26, value: (x) => x.hotelName },
      { header: 'EX', width: 32, value: (x) => x.activity },
      { header: 'DATE', width: 12, value: (x) => x.date },
      { header: 'TIME', width: 8, value: (x) => x.time },
      { header: 'TRAVEL AGENCY', width: 18, value: (x) => x.agency?.name },
      { header: 'STATUS', width: 12, value: (x) => STATUS_LABEL[x.status] },
      { header: 'CURRENCY', width: 9, value: (x) => x.currency },
      { header: 'COST', value: (x) => x.cost },
      { header: 'SELL', value: (x) => x.sell },
      { header: 'NOTES', width: 30, value: (x) => x.notes },
    ], data);
  }
}

function snapshot(x: ExcursionItem): Record<string, unknown> {
  return { ...x, agency: x.agency?.name ?? null, sale: x.sale?.ref ?? null };
}

@ApiTags('excursions')
@ApiBearerAuth()
@Controller({ path: 'excursions', version: '1' })
export class ExcursionsController {
  constructor(
    private readonly service: ExcursionsService,
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
    return this.activity.list('EXCURSION', id);
  }

  @Post()
  create(@Body() dto: ExcursionDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExcursionDto, @CurrentUser() user: AuthUser) {
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
