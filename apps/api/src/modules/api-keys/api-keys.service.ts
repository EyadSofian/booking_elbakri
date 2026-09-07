import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ALL_API_KEY_SCOPES, type ApiKeyScope } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<unknown> {
    // The hash is never selected, so a key can never leak through this endpoint.
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  /**
   * Issues a key.
   *
   * The plaintext is returned exactly once and only the Argon2 hash is stored,
   * so a database leak cannot be turned into working credentials. Scopes are
   * read-only by construction — see API_KEY_SCOPE_PERMISSIONS.
   */
  async create(
    input: { name: string; scopes: string[]; expiresAt?: Date | null },
    ctx: ActorContext,
  ): Promise<{ id: string; name: string; key: string; keyPrefix: string; scopes: string[] }> {
    const invalid = input.scopes.filter((s) => !ALL_API_KEY_SCOPES.includes(s as ApiKeyScope));
    if (invalid.length) {
      throw new ValidationError(`Unknown API key scopes: ${invalid.join(', ')}`, {
        allowed: ALL_API_KEY_SCOPES,
      });
    }
    if (!input.scopes.length) {
      throw new ValidationError('An API key needs at least one scope.');
    }

    const secret = randomBytes(32).toString('base64url');
    const key = `elb_${secret}`;
    const keyPrefix = key.slice(0, 12);

    const created = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        keyHash: await AuthService.hashPassword(key),
        keyPrefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
        createdById: ctx.actorId ?? null,
      },
      select: { id: true, name: true, keyPrefix: true, scopes: true },
    });

    await this.audit.record({
      action: 'API_KEY_CREATED', entityType: 'ApiKey', entityId: created.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { name: input.name, scopes: input.scopes, keyPrefix },
    });

    return { ...created, key };
  }

  async revoke(id: string, ctx: ActorContext): Promise<unknown> {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: { id: true, name: true, revokedAt: true },
    });
    if (!existing) throw new NotFoundError('API key', id);

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, name: true, keyPrefix: true, revokedAt: true },
    });

    await this.audit.record({
      action: 'API_KEY_REVOKED', entityType: 'ApiKey', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { name: existing.name },
    });
    return updated;
  }

  scopes(): { scopes: readonly string[] } {
    return { scopes: ALL_API_KEY_SCOPES };
  }
}
