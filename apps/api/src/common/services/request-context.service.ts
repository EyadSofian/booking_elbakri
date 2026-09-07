import { Injectable, Scope } from '@nestjs/common';
import type { AuthenticatedActor } from '../decorators';

/**
 * Per-request metadata that audit logging attaches to every mutation, so an
 * entry can always answer "who changed this, from where, in which request".
 */
@Injectable({ scope: Scope.REQUEST })
export class RequestContext {
  actor?: AuthenticatedActor;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ActorContext {
  actorId?: string;
  actorLabel?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export function toActorContext(
  actor: AuthenticatedActor | undefined,
  req?: { requestId?: string; ip?: string; headers?: Record<string, unknown> },
): ActorContext {
  return {
    actorId: actor?.kind === 'USER' ? actor.id : undefined,
    actorLabel:
      actor?.kind === 'API_KEY'
        ? `api-key:${actor.apiKeyName ?? actor.id}`
        : (actor?.email ?? actor?.fullName),
    requestId: req?.requestId,
    ipAddress: req?.ip,
    userAgent: typeof req?.headers?.['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : undefined,
  };
}
