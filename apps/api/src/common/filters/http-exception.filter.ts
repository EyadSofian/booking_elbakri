import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, type ApiErrorResponse } from '@elbakri/shared';
import type { Request, Response } from 'express';
import { DomainError } from '../errors';

/**
 * Turns every failure into the same envelope:
 * `{ error: { code, message, details, requestId } }`.
 *
 * Internal exception details never reach the client — the stack goes to the
 * structured log, keyed by the same request id the client is given.
 */
/** True only for our own `{ error: { code, message } }` envelope. */
function isApiErrorResponse(payload: unknown): payload is ApiErrorResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && 'code' in error;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId;

    const { status, body } = this.describe(exception, requestId);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // An Error's `message` and `stack` are non-enumerable, so logging the
      // object alone yields an entry with no useful content — which is exactly
      // when you most need one. Pull them out explicitly.
      const err = exception as Partial<Error> & { code?: string; meta?: unknown };
      this.logger.error(
        {
          requestId,
          path: request.url,
          method: request.method,
          name: err?.name,
          code: err?.code,
          meta: err?.meta,
          message: err?.message,
          stack: err?.stack,
        },
        `Unhandled exception: ${err?.message ?? String(exception)}`,
      );
    } else if (status === HttpStatus.FORBIDDEN || status === HttpStatus.UNAUTHORIZED) {
      this.logger.warn({ requestId, path: request.url, code: body.error.code }, 'Access denied');
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown, requestId?: string): { status: number; body: ApiErrorResponse } {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        body: { error: { code: exception.code, message: exception.message, details: exception.details, requestId } },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // Only treat this as our own envelope when `error` is an object carrying a
      // code. Nest's built-in exceptions also have an `error` key, but it holds
      // a string ("Not Found"), which spreading would explode into char keys.
      if (isApiErrorResponse(payload)) {
        return { status, body: { error: { ...payload.error, requestId } } };
      }
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        body: {
          error: {
            code: this.codeForStatus(status),
            message: Array.isArray(message) ? message.join('; ') : message,
            details: typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined,
            requestId,
          },
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception, requestId);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
          requestId,
        },
      },
    };
  }

  private describePrisma(
    e: Prisma.PrismaClientKnownRequestError,
    requestId?: string,
  ): { status: number; body: ApiErrorResponse } {
    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            error: {
              code: ERROR_CODES.CONFLICT,
              message: 'A record with these values already exists.',
              details: { fields: e.meta?.target },
              requestId,
            },
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { error: { code: ERROR_CODES.NOT_FOUND, message: 'Record not found.', requestId } },
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            error: {
              code: ERROR_CODES.CONFLICT,
              message: 'A related record is missing or still referenced.',
              details: { field: e.meta?.field_name },
              requestId,
            },
          },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'A database error occurred.', requestId } },
        };
    }
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST: return ERROR_CODES.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED: return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN: return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND: return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT: return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS: return ERROR_CODES.RATE_LIMITED;
      default: return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}
