import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../errors';
import { ALLOW_API_KEY, PUBLIC_KEY, type AuthenticatedActor } from '../decorators';
import { AuthService } from '../../modules/auth/auth.service';
import { PrismaService } from '../services/prisma.service';

/**
 * Authenticates the request and attaches the resolved actor.
 *
 * Permissions are recomputed from the database on every request rather than
 * read from the token, so revoking access takes effect immediately instead of
 * waiting for the access token to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    if (!header) {
      throw new DomainError('UNAUTHENTICATED', 'Authentication is required.', 401);
    }

    const [scheme, token] = header.split(' ');
    if (!token) {
      throw new DomainError('UNAUTHENTICATED', 'Malformed authorization header.', 401);
    }

    if (scheme?.toLowerCase() === 'apikey') {
      const allowApiKey = this.reflector.getAllAndOverride<boolean>(ALLOW_API_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowApiKey) {
        throw new DomainError('FORBIDDEN', 'API keys cannot access this endpoint.', 403);
      }
      const actor = await this.auth.resolveApiKey(token);
      if (!actor) {
        throw new DomainError('UNAUTHENTICATED', 'The API key is invalid or has been revoked.', 401);
      }
      request.actor = actor;
      return true;
    }

    if (scheme?.toLowerCase() !== 'bearer') {
      throw new DomainError('UNAUTHENTICATED', 'Unsupported authorization scheme.', 401);
    }

    let payload: { sub: string; sid?: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new DomainError('UNAUTHENTICATED', 'The access token is invalid or has expired.', 401);
    }
    if (payload.typ !== 'access') {
      throw new DomainError('UNAUTHENTICATED', 'A refresh token cannot be used to access the API.', 401);
    }

    // A revoked session invalidates its access tokens immediately.
    if (payload.sid) {
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sid },
        select: { revokedAt: true, expiresAt: true },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new DomainError('UNAUTHENTICATED', 'This session has ended. Please sign in again.', 401);
      }
    }

    const actor: AuthenticatedActor = await this.auth.buildActor(payload.sub);
    actor.sessionId = payload.sid;
    request.actor = actor;
    return true;
  }
}
