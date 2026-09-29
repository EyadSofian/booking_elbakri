import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityItem, EntityType } from '@elbakri/shared';
import { PrismaService } from './prisma.service';

type Snapshot = Record<string, unknown>;

/**
 * The history shown under every record: who created it, who changed what, and
 * every status move. Written in the same breath as the change itself.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(args: {
    type: EntityType;
    id: string;
    action: string;
    userId: string | null;
    summary?: string | null;
    changes?: Record<string, { from: unknown; to: unknown }> | null;
  }): Promise<void> {
    await this.prisma.activity.create({
      data: {
        entityType: args.type,
        entityId: args.id,
        action: args.action,
        userId: args.userId,
        summary: args.summary ?? null,
        changes: args.changes ? (args.changes as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  /** Field-by-field difference between two snapshots of a record. */
  diff(before: Snapshot, after: Snapshot, fields: readonly string[]): Record<string, { from: unknown; to: unknown }> | null {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of fields) {
      const a = before[field] ?? null;
      const b = after[field] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) out[field] = { from: a, to: b };
    }
    return Object.keys(out).length ? out : null;
  }

  async list(type: EntityType, id: string): Promise<ActivityItem[]> {
    const rows = await this.prisma.activity.findMany({
      where: { entityType: type, entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      summary: r.summary,
      changes: (r.changes as ActivityItem['changes']) ?? null,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
