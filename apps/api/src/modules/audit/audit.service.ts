import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/** Field names whose values must never reach the audit trail. */
const REDACTED_FIELDS = new Set([
  'password', 'passwordHash', 'refreshToken', 'refreshTokenHash', 'tokenHash',
  'keyHash', 'accessToken', 'secret', 'passportNumber',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a material mutation.
   *
   * Auditing must never break the operation it describes, so a failure here is
   * logged rather than thrown — but it is logged loudly.
   */
  async record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          actorId: event.actorId ?? null,
          actorLabel: event.actorLabel ?? null,
          requestId: event.requestId ?? null,
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          before: this.sanitize(event.before) as Prisma.InputJsonValue,
          after: this.sanitize(event.after) as Prisma.InputJsonValue,
          metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error({ err, action: event.action, entityType: event.entityType }, 'Failed to write audit log');
    }
  }

  /** Records many events inside the caller's transaction. */
  async recordMany(events: AuditEvent[], tx?: Prisma.TransactionClient): Promise<void> {
    for (const e of events) await this.record(e, tx);
  }

  /**
   * Strips secrets and Decimal/Date wrappers so the stored snapshot is plain,
   * comparable JSON.
   */
  private sanitize(value: unknown): unknown {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.sanitize(v));
    if (typeof value === 'object') {
      // Prisma Decimal and similar wrappers expose toString().
      if ('toFixed' in (value as object) || (value as { s?: unknown }).s !== undefined) {
        const str = String(value);
        if (/^-?\d+(\.\d+)?$/.test(str)) return str;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (REDACTED_FIELDS.has(k)) {
          out[k] = '[redacted]';
          continue;
        }
        const sanitized = this.sanitize(v);
        if (sanitized !== undefined) out[k] = sanitized;
      }
      return out;
    }
    return value;
  }

  /**
   * Diff two snapshots down to the fields that actually changed, so an audit
   * entry shows the change rather than the whole record.
   */
  diff(before: Record<string, unknown> | null, after: Record<string, unknown>): {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    changedFields: string[];
  } {
    const changed: string[] = [];
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);

    for (const key of keys) {
      if (key === 'updatedAt' || key === 'version') continue;
      const bv = before?.[key];
      const av = after[key];
      if (JSON.stringify(this.sanitize(bv)) !== JSON.stringify(this.sanitize(av))) {
        changed.push(key);
        b[key] = bv;
        a[key] = av;
      }
    }
    return { before: b, after: a, changedFields: changed };
  }
}
