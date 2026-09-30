/** Consistent response envelope for every REST endpoint. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page, pageSize, total, totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/** Stable machine-readable error codes shared by API and web. */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  CHECKOUT_BEFORE_CHECKIN: 'CHECKOUT_BEFORE_CHECKIN',
  END_BEFORE_START: 'END_BEFORE_START',
  RETURN_BEFORE_OUTBOUND: 'RETURN_BEFORE_OUTBOUND',
  LAST_ADMIN: 'LAST_ADMIN',
  CANNOT_CHANGE_OWN_ACCESS: 'CANNOT_CHANGE_OWN_ACCESS',
  UNKNOWN_WORKBOOK: 'UNKNOWN_WORKBOOK',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
