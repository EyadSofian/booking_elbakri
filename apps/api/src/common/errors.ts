import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@elbakri/shared';

/**
 * A business-rule failure. Carries a stable machine code the frontend maps to a
 * localised message, so no user-facing English is baked into the API.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
    readonly httpStatus: number = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super(ERROR_CODES.NOT_FOUND, `${entity} was not found.`, HttpStatus.NOT_FOUND, id ? { entity, id } : { entity });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have permission to perform this action.', details?: Record<string, unknown>) {
    super(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN, details);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ERROR_CODES.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ERROR_CODES.CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * Raised when a client submits an update based on a version of the record that
 * has since changed — the concurrent write is rejected rather than silently
 * overwriting a colleague's edit.
 */
export class StaleRecordError extends DomainError {
  constructor(entity: string, expected: number, actual: number) {
    super(
      ERROR_CODES.STALE_RECORD,
      `This ${entity} was modified by someone else. Reload and reapply your changes.`,
      HttpStatus.CONFLICT,
      { entity, expectedVersion: expected, currentVersion: actual },
    );
  }
}

export class InvalidStatusTransitionError extends DomainError {
  constructor(entity: string, from: string, to: string, allowed: readonly string[]) {
    super(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `A ${entity} cannot move from ${from} to ${to}.`,
      HttpStatus.CONFLICT,
      { entity, from, to, allowed },
    );
  }
}
