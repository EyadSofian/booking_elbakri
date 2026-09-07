import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';

/**
 * Assigns a correlation id to every request and echoes it back, so a user can
 * quote the id from an error message and it can be found in the logs.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const incoming = request.headers?.['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    return next.handle();
  }
}
