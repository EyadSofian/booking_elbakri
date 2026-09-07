import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const sortQuerySchema = z.object({
  sortBy: z.string().max(60).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});

export const dateRangeQuerySchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  dateTo: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const listQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(searchQuerySchema)
  .merge(dateRangeQuerySchema);

export type ListQuery = z.infer<typeof listQuerySchema>;
