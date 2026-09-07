import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Splits repeated or comma-separated query values into an array. */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
};

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 200 })
  @Type(() => Number) @IsInt() @Min(1) @Max(200) @IsOptional()
  pageSize = 25;
}

export class ListQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsString() @MaxLength(200) @IsOptional()
  q?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(60) @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc']) @IsOptional()
  sortDir: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Comma-separated list of statuses' })
  @Transform(toArray) @IsArray() @IsOptional()
  status?: string[];
}

export class DateRangeDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsDateString() @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString() @IsOptional()
  dateTo?: string;
}

export class StatusChangeDto {
  @ApiPropertyOptional()
  @IsString() @MaxLength(500) @IsOptional()
  reason?: string;
}

export class BooleanFlagDto {
  @Transform(toBoolean) @IsBoolean() @IsOptional()
  value?: boolean;
}

/** Parses a date-only or ISO string to a Date, or undefined. */
export function toDate(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export { toArray, toBoolean };
