import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateBy, type ValidationOptions } from 'class-validator';
import { STATUSES, type Status, type StatusCounts } from '@elbakri/shared';

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written as YYYY-MM-DD (so 2026-13-01 and 2026-02-30 fail). */
export function isDateOnly(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function IsDateOnly(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDateOnly',
      validator: {
        validate: (value) => isDateOnly(value),
        defaultMessage: (args) => `${args?.property} must be a date written as YYYY-MM-DD`,
      },
    },
    options,
  );
}

/** Query shared by every list screen. */
export class ListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number) @IsInt() @Min(1) @Max(500) @IsOptional()
  pageSize = 50;

  @ApiPropertyOptional({ description: 'Search by name, phone, hotel, flight…' })
  @IsString() @MaxLength(200) @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Comma-separated statuses' })
  @Transform(toArray) @IsArray() @IsIn(STATUSES, { each: true }) @IsOptional()
  status?: Status[];

  @ApiPropertyOptional({ description: 'today | tomorrow | upcoming | past | this-month' })
  @IsIn(['today', 'tomorrow', 'upcoming', 'past', 'this-month']) @IsOptional()
  when?: 'today' | 'tomorrow' | 'upcoming' | 'past' | 'this-month';

  @ApiPropertyOptional({ format: 'date' })
  @IsDateOnly() @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateOnly() @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsUUID() @IsOptional()
  agencyId?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(40) @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsIn(['asc', 'desc']) @IsOptional()
  sortDir?: 'asc' | 'desc';
}

export function skipTake(q: ListQueryDto): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/** Turns a `groupBy status` result into the counts shown on the status tabs. */
export function toCounts(groups: Array<{ status: Status; _count: { _all: number } }>): StatusCounts {
  const counts = Object.fromEntries([...STATUSES, 'ALL'].map((s) => [s, 0])) as StatusCounts;
  for (const g of groups) {
    counts[g.status] = g._count._all;
    counts.ALL += g._count._all;
  }
  return counts;
}

/** Resolves the quick `when` filter and explicit dates into a date range. */
export function dateRange(
  q: ListQueryDto,
  today: string,
  tomorrow: string,
): { gte?: Date; lte?: Date; lt?: Date } | undefined {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  if (q.when === 'today') return { gte: d(today), lte: d(today) };
  if (q.when === 'tomorrow') return { gte: d(tomorrow), lte: d(tomorrow) };
  if (q.when === 'upcoming') return { gte: d(today) };
  if (q.when === 'past') return { lt: d(today) };
  if (q.when === 'this-month') {
    const start = `${today.slice(0, 7)}-01`;
    const next = new Date(d(start));
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { gte: d(start), lt: next };
  }
  if (q.dateFrom || q.dateTo) {
    return {
      ...(q.dateFrom ? { gte: d(q.dateFrom) } : {}),
      ...(q.dateTo ? { lte: d(q.dateTo) } : {}),
    };
  }
  return undefined;
}
