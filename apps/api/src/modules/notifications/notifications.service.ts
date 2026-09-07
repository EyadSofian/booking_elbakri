import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginationMeta, type PaginatedResponse } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';

export interface NotificationInput {
  userId: string;
  type: string;
  severity?: string;
  title: string;
  titleAr?: string | null;
  body?: string | null;
  bodyAr?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
}

/**
 * In-app notifications.
 *
 * Delivery is deliberately separated from the domain services that raise
 * events, so email or WhatsApp can be added later as another consumer without
 * touching any booking or finance logic.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotificationInput): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        severity: input.severity ?? 'INFO',
        title: input.title,
        titleAr: input.titleAr ?? null,
        body: input.body ?? null,
        bodyAr: input.bodyAr ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        link: input.link ?? null,
      },
    });
  }

  /** Notifies every user who holds a given permission. */
  async notifyPermissionHolders(
    permissionKey: string,
    input: Omit<NotificationInput, 'userId'>,
  ): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { roles: { some: { role: { permissions: { some: { permission: { key: permissionKey } } } } } } },
          { permissionOverrides: { some: { granted: true, permission: { key: permissionKey } } } },
        ],
      },
      select: { id: true },
    });

    for (const user of users) {
      await this.notify({ ...input, userId: user.id });
    }
    return users.length;
  }

  async list(
    userId: string,
    page: number,
    pageSize: number,
    unreadOnly = false,
  ): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(page, pageSize, total) };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, ids: string[]): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
