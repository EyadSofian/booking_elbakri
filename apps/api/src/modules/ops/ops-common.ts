import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CURRENCIES, STATUSES, formatRef, type CurrencyCode, type EntityType, type OpsBase, type Status } from '@elbakri/shared';
import { clean, num } from '../../common/values';
import type { ListQueryDto } from '../../common/list';

/** Fields every operations booking takes. */
export class OpsBaseDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES) @IsOptional()
  status?: Status;

  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(200)
  guestName!: string;

  @IsString() @MaxLength(100) @IsOptional()
  nationality?: string | null;

  @IsString() @MaxLength(60) @IsOptional()
  phone?: string | null;

  @IsUUID() @IsOptional()
  agencyId?: string | null;

  @IsIn(CURRENCIES) @IsOptional()
  currency?: CurrencyCode;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
  cost?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
  sell?: number | null;

  @IsString() @MaxLength(4000) @IsOptional()
  notes?: string | null;
}

export class StatusDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: Status;
}

/** Prisma data for the shared fields. `undefined` leaves a field untouched. */
export function baseData(dto: Partial<OpsBaseDto>) {
  return {
    status: dto.status,
    guestName: dto.guestName === undefined ? undefined : clean(dto.guestName)!,
    nationality: clean(dto.nationality),
    phone: clean(dto.phone),
    agencyId: dto.agencyId === undefined ? undefined : dto.agencyId || null,
    currency: dto.currency,
    cost: dto.cost,
    sell: dto.sell,
    notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
  };
}

export const baseInclude = {
  agency: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

interface BaseRow {
  id: string;
  number: number;
  status: Status;
  guestName: string;
  nationality: string | null;
  phone: string | null;
  currency: CurrencyCode;
  cost: Prisma.Decimal | null;
  sell: Prisma.Decimal | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  agency: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
}

export function baseItem(type: EntityType, row: BaseRow): OpsBase {
  return {
    id: row.id,
    number: row.number,
    ref: formatRef(type, row.number),
    status: row.status,
    guestName: row.guestName,
    nationality: row.nationality,
    phone: row.phone,
    agency: row.agency,
    currency: row.currency,
    cost: num(row.cost),
    sell: num(row.sell),
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Search across the shared fields plus the module's own text columns.
 * A term like "H-120" or "120" also finds the record by its number.
 */
export function searchWhere(
  q: string | undefined,
  fields: string[],
  extra: (term: string) => Record<string, unknown>[] = () => [],
): Record<string, unknown> | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const or: Record<string, unknown>[] = [
    ...['guestName', 'phone', 'nationality', 'notes', ...fields].map((f) => ({ [f]: { contains: term, mode: 'insensitive' } })),
    { agency: { name: { contains: term, mode: 'insensitive' } } },
    ...extra(term),
  ];
  const n = term.match(/^[A-Za-z]?-?(\d{1,9})$/);
  if (n) or.push({ number: Number(n[1]) });
  return { OR: or };
}

/** Common filters: agency, not deleted. */
export function baseWhere(q: ListQueryDto): Record<string, unknown> {
  return {
    deletedAt: null,
    ...(q.agencyId ? { agencyId: q.agencyId } : {}),
  };
}

export type SortSpec = Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>>;

/** Builds `orderBy` from an allow-list, so a query string can't sort by anything else. */
export function orderBy(q: ListQueryDto, allowed: SortSpec, fallback: Record<string, unknown>[]): Record<string, unknown>[] {
  const build = q.sortBy ? allowed[q.sortBy] : undefined;
  if (!build) return fallback;
  return [build(q.sortDir ?? 'asc'), { number: 'desc' }];
}

/** Nullable columns sort with blanks last in both directions. */
export const nullableSort = (field: string) => (dir: 'asc' | 'desc') => ({ [field]: { sort: dir, nulls: 'last' } });
export const plainSort = (field: string) => (dir: 'asc' | 'desc') => ({ [field]: dir });

export const STATUS_LABEL: Record<Status, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  CONFIRMED: 'Confirmed',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};
