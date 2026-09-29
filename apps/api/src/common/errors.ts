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
  constructor(message = 'You do not have permission to perform this action.') {
    super(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, code: ErrorCode = ERROR_CODES.VALIDATION_FAILED, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ERROR_CODES.CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}
