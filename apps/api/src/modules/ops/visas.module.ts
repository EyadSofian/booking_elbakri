import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import type { ListResponse, Status, VisaItem } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { NotFoundError } from '../../common/errors';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { IsDateOnly, ListQueryDto, dateRange, skipTake, toCounts } from '../../common/list';
import { clean, fromDbDate, toDbDate, todayIn } from '../../common/values';
import { sendWorkbook } from '../../common/excel';
import {
  OpsBaseDto, STATUS_LABEL, StatusDto, baseData, defaultAgencyId, baseInclude, baseItem, baseWhere, nullableSort, orderBy, plainSort, searchWhere,
} from './ops-common';

export class VisaDto extends OpsBaseDto {
  @IsInt() @Min(1) @Max(999) @IsOptional()
  pax?: number;

  @IsString() @MaxLength(120) @IsOptional()
  fromPlace?: string | null;

  @IsString() @MaxLength(120) @IsOptional()
  toPlace?: string | null;

  @IsDateOnly() @IsOptional()
  travelDate?: string | null;

  @IsString() @MaxLength(60) @IsOptional()
  passportNo?: string | null;
}

export class UpdateVisaDto extends PartialType(VisaDto) {}

const include = baseInclude;

const TRACKED = [
  'status', 'guestName', 'nationality', 'phone', 'agency', 'pax', 'fromPlace', 'toPlace', 'travelDate', 'passportNo',
  'currency', 'cost', 'sell', 'notes', 'sale',
] as const;

const SORTS = {
  travelDate: nullableSort('travelDate'),
  guestName: plainSort('guestName'),
  status: plainSort('status'),
  number: plainSort('number'),
  createdAt: plainSort('createdAt'),
  agency: (dir: 'asc' | 'desc') => ({ agency: { name: dir } }),
};

type Row = Awaited<ReturnType<VisasService['findRow']>>;

@Injectable()
export class VisasService {
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE', 'Africa/Cairo');
  }

  findRow(id: string) {
    return this.prisma.visa.findFirst({ where: { id, deletedAt: null }, include });
  }

  toItem(row: NonNullable<Row>): VisaItem {
    return {
      ...baseItem('VISA', row),
      pax: row.pax,
      fromPlace: row.fromPlace,
      toPlace: row.toPlace,
      travelDate: fromDbDate(row.travelDate),
      passportNo: row.passportNo,
    };
  }

  private where(q: ListQueryDto): Record<string, unknown> {
    const and: Record<string, unknown>[] = [baseWhere(q)];
    const search = searchWhere(q.q, ['fromPlace', 'toPlace', 'passportNo']);
    if (search) and.push(search);
    const range = dateRange(q, todayIn(this.tz), todayIn(this.tz, 1));
    if (range) and.push({ travelDate: range });
    return { AND: and };
  }

  async list(q: ListQueryDto): Promise<ListResponse<VisaItem>> {
    const where = this.where(q);
    const filtered = q.status?.length ? { AND: [where, { status: { in: q.status } }] } : where;
    const dir = q.when === 'upcoming' || q.when === 'today' || q.when === 'tomorrow' ? 'asc' : 'desc';
    const fallback = [{ travelDate: { sort: dir, nulls: 'last' } }, { number: 'desc' }];
    const [rows, total, groups] = await Promise.all([
      this.prisma.visa.findMany({ where: filtered, include, orderBy: orderBy(q, SORTS, fallback), ...skipTake(q) }),
      this.prisma.visa.count({ where: filtered }),
      this.prisma.visa.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), total, page: q.page, pageSize: q.pageSize, counts: toCounts(groups) };
  }

  private async mustFind(id: string): Promise<NonNullable<Row>> {
    const row = await this.findRow(id);
    if (!row) throw new NotFoundError('Visa', id);
    return row;
  }

  async get(id: string): Promise<VisaItem> {
    return this.toItem(await this.mustFind(id));
  }

  private data(dto: UpdateVisaDto) {
    return {
      ...baseData(dto),
      pax: dto.pax,
      fromPlace: clean(dto.fromPlace),
      toPlace: clean(dto.toPlace),
      travelDate: toDbDate(dto.travelDate),
      passportNo: clean(dto.passportNo),
    };
  }

  async create(dto: VisaDto, user: AuthUser): Promise<VisaItem> {
    const data = this.data(dto);
    data.agencyId = data.agencyId ?? (await defaultAgencyId(this.prisma, dto));
    const row = await this.prisma.visa.create({
      data: { ...data, guestName: data.guestName!, createdById: user.id },
      include,
    });
    await this.activity.log({ type: 'VISA', id: row.id, action: 'CREATED', userId: user.id });
    return this.toItem(row);
  }

  async update(id: string, dto: UpdateVisaDto, user: AuthUser): Promise<VisaItem> {
    const before = this.toItem(await this.mustFind(id));
    const row = await this.prisma.visa.update({ where: { id }, data: this.data(dto), include });
    const after = this.toItem(row);
    const changes = this.activity.diff(snapshot(before), snapshot(after), TRACKED);
    if (changes) await this.activity.log({ type: 'VISA', id, action: 'UPDATED', userId: user.id, changes });
    return after;
  }

  async setStatus(id: string, status: Status, user: AuthUser): Promise<VisaItem> {
    const before = await this.mustFind(id);
    if (before.status === status) return this.toItem(before);
    const row = await this.prisma.visa.update({ where: { id }, data: { status }, include });
    await this.activity.log({
      type: 'VISA', id, action: 'STATUS', userId: user.id,
      summary: `${STATUS_LABEL[before.status]} → ${STATUS_LABEL[status]}`,
      changes: { status: { from: before.status, to: status } },
    });
    return this.toItem(row);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.mustFind(id);
    await this.prisma.visa.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log({ type: 'VISA', id, action: 'DELETED', userId: user.id });
  }

  async export(q: ListQueryDto, res: Response): Promise<void> {
    const { data } = await this.list(Object.assign(new ListQueryDto(), q, { page: 1, pageSize: 5000 }));
    await sendWorkbook(res, `visas-${todayIn(this.tz)}.xlsx`, 'Visas', [
      { header: 'REF', width: 9, value: (v) => v.ref },
      { header: 'NAME', width: 26, value: (v) => v.guestName },
      { header: 'PHONE', value: (v) => v.phone },
      { header: 'FROM', value: (v) => v.fromPlace },
      { header: 'TO', value: (v) => v.toPlace },
      { header: 'PAXS', width: 7, value: (v) => v.pax },
      { header: 'NATIONALITY', value: (v) => v.nationality },
      { header: 'DATE', width: 12, value: (v) => v.travelDate },
      { header: 'TRAVEL AGENCY', width: 18, value: (v) => v.agency?.name },
      { header: 'PASSPORT', value: (v) => v.passportNo },
      { header: 'STATUS', width: 12, value: (v) => STATUS_LABEL[v.status] },
      { header: 'CURRENCY', width: 9, value: (v) => v.currency },
      { header: 'NET', value: (v) => v.cost },
      { header: 'SELL', value: (v) => v.sell },
      { header: 'NOTES', width: 30, value: (v) => v.notes },
    ], data);
  }
}

function snapshot(v: VisaItem): Record<string, unknown> {
  return { ...v, agency: v.agency?.name ?? null, sale: v.sale?.ref ?? null };
}

@ApiTags('visas')
@ApiBearerAuth()
@Controller({ path: 'visas', version: '1' })
export class VisasController {
  constructor(
    private readonly service: VisasService,
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
    return this.activity.list('VISA', id);
  }

  @Post()
  create(@Body() dto: VisaDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisaDto, @CurrentUser() user: AuthUser) {
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
