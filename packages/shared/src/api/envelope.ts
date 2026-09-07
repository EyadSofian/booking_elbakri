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
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  STALE_RECORD: 'STALE_RECORD',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  CHECKOUT_BEFORE_CHECKIN: 'CHECKOUT_BEFORE_CHECKIN',
  BOOKING_DATE_AFTER_CHECKIN: 'BOOKING_DATE_AFTER_CHECKIN',
  PAYMENT_EXCEEDS_DOCUMENT: 'PAYMENT_EXCEEDS_DOCUMENT',
  PAYMENT_ALREADY_REVERSED: 'PAYMENT_ALREADY_REVERSED',
  DUPLICATE_IMPORT: 'DUPLICATE_IMPORT',
  IMPORT_NOT_READY: 'IMPORT_NOT_READY',
  IMPORT_ALREADY_APPLIED: 'IMPORT_ALREADY_APPLIED',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  CANNOT_MODIFY_OWN_ACCESS: 'CANNOT_MODIFY_OWN_ACCESS',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
