import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Role } from '@elbakri/shared';
import { DomainError, ForbiddenError } from './errors';
import { FLAG_KEY, PUBLIC_KEY, ROLES_KEY, type AccessFlag, type AuthUser } from './auth';
import { PrismaService } from './prisma.service';

/**
 * Signs the request in from its bearer token, then checks the role.
 *
 * The user is re-read on every request, so deactivating someone or changing
 * their role takes effect immediately rather than when a token expires.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new DomainError('UNAUTHENTICATED', 'Authentication is required.', 401);
    }

    let payload: { sub: string; sid: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });
    } catch {
      throw new DomainError('UNAUTHENTICATED', 'The access token is invalid or has expired.', 401);
    }
    if (payload.typ !== 'access') {
      throw new DomainError('UNAUTHENTICATED', 'Invalid token type.', 401);
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        revokedAt: true,
        expiresAt: true,
        user: { select: { id: true, name: true, email: true, role: true, seesAllSales: true, visaAccess: true, isActive: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
      throw new DomainError('UNAUTHENTICATED', 'This session has ended. Please sign in again.', 401);
    }

    const user: AuthUser = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      seesAllSales: session.user.seesAllSales,
      visaAccess: session.user.visaAccess,
      sessionId: payload.sid,
    };
    request.user = user;

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (allowed && user.role !== 'ADMIN' && !allowed.includes(user.role)) {
      // The class may open the area to people with a switch turned on.
      const flag = this.reflector.get<AccessFlag | undefined>(FLAG_KEY, context.getClass());
      if (!flag || !user[flag]) throw new ForbiddenError();
    }
    return true;
  }
}
