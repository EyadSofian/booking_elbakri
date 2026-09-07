import { buildPaginationMeta, type PaginatedResponse } from '@elbakri/shared';

export interface PageArgs {
  page: number;
  pageSize: number;
}

export function toSkipTake(args: PageArgs): { skip: number; take: number } {
  return { skip: (args.page - 1) * args.pageSize, take: args.pageSize };
}

export function paginate<T>(data: T[], total: number, args: PageArgs): PaginatedResponse<T> {
  return { data, meta: buildPaginationMeta(args.page, args.pageSize, total) };
}

/**
 * Builds a Prisma `orderBy` from a client-supplied sort field, restricted to an
 * explicit allow-list so a query string can never order by an arbitrary column.
 */
export function buildOrderBy<T extends string>(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc',
  allowed: readonly T[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, unknown> {
  if (!sortBy) return fallback;
  if (!(allowed as readonly string[]).includes(sortBy)) return fallback;
  // Supports one level of nesting, e.g. "leadTraveler.fullName".
  if (sortBy.includes('.')) {
    const [relation, field] = sortBy.split('.');
    return { [relation]: { [field]: sortDir } };
  }
  return { [sortBy]: sortDir };
}
