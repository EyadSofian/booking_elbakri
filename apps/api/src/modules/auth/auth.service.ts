import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { DomainError, ValidationError } from '../../common/errors';

export interface SessionUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUserDto;
}

const ARGON: argon2.Options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Verified against when the account does not exist, so a wrong email and a
// wrong password take the same time.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON);
  }

  private static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async login(email: string, password: string, userAgent?: string): Promise<TokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
    if (!user || !valid || !user.isActive) {
      throw new DomainError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
    }

    const refreshDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS', 30);
    const secret = randomBytes(48).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: AuthService.sha256(secret),
        expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
        userAgent: userAgent?.slice(0, 300),
      },
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      ...(await this.accessToken(user.id, session.id)),
      refreshToken: `${session.id}.${secret}`,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  /**
   * Issues a fresh access token for a live session.
   *
   * The refresh token itself does not rotate: two open tabs, or a page reloaded
   * while a refresh is in flight, would otherwise race each other and sign the
   * person out. Signing out or changing the password ends the session.
   */
  async refresh(compositeToken: string): Promise<TokenResponse> {
    const [sessionId, secret] = compositeToken.split('.');
    const invalid = () => new DomainError('INVALID_REFRESH_TOKEN', 'This session is no longer valid.', 401);
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw invalid();

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.user.isActive ||
      session.refreshTokenHash !== AuthService.sha256(secret)
    ) {
      throw invalid();
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

    const { user } = session;
    return {
      ...(await this.accessToken(user.id, session.id)),
      refreshToken: compositeToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, current: string, next: string, keepSessionId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, current).catch(() => false);
    if (!ok) throw new ValidationError('The current password is incorrect.', 'INVALID_CREDENTIALS');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(next) },
    });
    // Every other device signs in again with the new password.
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });
  }

  private async accessToken(userId: string, sessionId: string): Promise<{ accessToken: string; expiresIn: number }> {
    const ttl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: 'access' },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ttl },
    );
    return { accessToken, expiresIn: ttlSeconds(ttl) };
  }
}

function ttlSeconds(ttl: string): number {
  const m = ttl.match(/^(\d+)([smhd])$/);
  if (!m) return 900;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as const)[m[2] as 's' | 'm' | 'h' | 'd'];
}
