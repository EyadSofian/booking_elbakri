import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { normalizeForSearch, PERMISSIONS } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedActor } from '../../common/decorators';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON_OPTIONS);
  }

  private static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async validateUser(email: string, password: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, passwordHash: true, isActive: true, deletedAt: true },
    });

    // Always run a verification so a missing account and a wrong password take
    // comparable time, which keeps the endpoint from confirming who exists.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';
    let valid = false;
    try {
      valid = await argon2.verify(hash, password);
    } catch {
      valid = false;
    }

    if (!user || !valid || !user.isActive || user.deletedAt) {
      throw new DomainError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
    }
    return user.id;
  }

  async login(email: string, password: string, ctx: LoginContext): Promise<TokenPair & { actor: AuthenticatedActor }> {
    const userId = await this.validateUser(email, password);
    const actor = await this.buildActor(userId);
    const tokens = await this.issueTokens(userId, ctx);

    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      action: 'USER_LOGGED_IN',
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { ...tokens, actor };
  }

  /** Issues an access token plus a rotating refresh token bound to a session row. */
  async issueTokens(userId: string, ctx: LoginContext, replaceSessionId?: string): Promise<TokenPair> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS', 30);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = AuthService.sha256(refreshToken);
    const expiresAt = new Date(Date.now() + refreshDays * 86400_000);

    const session = await this.prisma.$transaction(async (tx) => {
      if (replaceSessionId) {
        await tx.session.update({
          where: { id: replaceSessionId },
          data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
        });
      }
      return tx.session.create({
        data: {
          userId,
          refreshTokenHash,
          expiresAt,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
        select: { id: true },
      });
    });

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, typ: 'access' },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );

    return { accessToken, refreshToken: `${session.id}.${refreshToken}`, expiresIn: this.ttlSeconds(accessTtl) };
  }

  async refresh(compositeToken: string, ctx: LoginContext): Promise<TokenPair & { actor: AuthenticatedActor }> {
    const [sessionId, secret] = compositeToken.split('.');
    if (!sessionId || !secret) {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'The refresh token is malformed.', 401);
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true, revokedAt: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'This session is no longer valid.', 401);
    }
    if (session.refreshTokenHash !== AuthService.sha256(secret)) {
      // A mismatched secret on a live session means the token was replayed or
      // stolen; every session for that user is revoked.
      await this.revokeAllSessions(session.userId, 'REFRESH_TOKEN_REUSE_DETECTED');
      this.logger.warn({ userId: session.userId }, 'Refresh token reuse detected — all sessions revoked');
      throw new DomainError('INVALID_REFRESH_TOKEN', 'This session is no longer valid.', 401);
    }

    const actor = await this.buildActor(session.userId);
    const tokens = await this.issueTokens(session.userId, ctx, session.id);
    return { ...tokens, actor };
  }

  async logout(sessionId: string | undefined, actorId: string, ctx: LoginContext): Promise<void> {
    if (sessionId) {
      await this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'USER_LOGOUT' },
      });
    }
    await this.audit.record({
      action: 'USER_LOGGED_OUT',
      entityType: 'User',
      entityId: actorId,
      actorId,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });
  }

  async revokeAllSessions(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, ctx: LoginContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) throw new NotFoundError('User', userId);

    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new ValidationError('The current password is incorrect.');
    if (newPassword.length < 12) {
      throw new ValidationError('The new password must be at least 12 characters long.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(newPassword) },
    });
    // Every other device is signed out after a password change.
    await this.revokeAllSessions(userId, 'PASSWORD_CHANGED');
    await this.audit.record({
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });
  }

  /**
   * Resolves the effective permission set: the union of role permissions,
   * plus per-user grants, minus per-user revocations.
   */
  async buildActor(userId: string): Promise<AuthenticatedActor> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true, email: true, fullName: true, locale: true, isActive: true,
        roles: {
          select: {
            role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } },
          },
        },
        permissionOverrides: { select: { granted: true, permission: { select: { key: true } } } },
      },
    });

    if (!user) throw new NotFoundError('User', userId);
    if (!user.isActive) throw new ForbiddenError('This account has been deactivated.');

    const permissions = new Set<string>();
    const roleKeys: string[] = [];
    for (const ur of user.roles) {
      roleKeys.push(ur.role.key);
      for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
    }
    for (const o of user.permissionOverrides) {
      if (o.granted) permissions.add(o.permission.key);
      else permissions.delete(o.permission.key);
    }

    return {
      kind: 'USER',
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      permissions: [...permissions],
      roleKeys,
    };
  }

  /** Resolves an `Authorization: ApiKey <token>` header to a scoped actor. */
  async resolveApiKey(rawKey: string): Promise<AuthenticatedActor | null> {
    const prefix = rawKey.slice(0, 12);
    const key = await this.prisma.apiKey.findFirst({
      where: { keyPrefix: prefix, revokedAt: null },
      select: { id: true, name: true, keyHash: true, scopes: true, expiresAt: true },
    });
    if (!key) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;

    const valid = await argon2.verify(key.keyHash, rawKey).catch(() => false);
    if (!valid) return null;

    await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });

    const { API_KEY_SCOPE_PERMISSIONS } = await import('@elbakri/shared');
    const permissions = new Set<string>();
    for (const scope of key.scopes) {
      for (const p of API_KEY_SCOPE_PERMISSIONS[scope as keyof typeof API_KEY_SCOPE_PERMISSIONS] ?? []) {
        permissions.add(p);
      }
    }
    // An API key never carries finance or administrative access, whatever
    // scopes it was granted.
    permissions.delete(PERMISSIONS.FINANCE_READ);
    permissions.delete(PERMISSIONS.VISAS_FINANCE_READ);

    return {
      kind: 'API_KEY',
      id: key.id,
      apiKeyName: key.name,
      permissions: [...permissions],
      roleKeys: [],
    };
  }

  async registerFirstUserName(fullName: string): Promise<string> {
    return normalizeForSearch(fullName);
  }

  private ttlSeconds(ttl: string): number {
    const m = ttl.match(/^(\d+)([smhd])$/);
    if (!m) return 900;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's': return n;
      case 'm': return n * 60;
      case 'h': return n * 3600;
      case 'd': return n * 86400;
      default: return 900;
    }
  }
}
