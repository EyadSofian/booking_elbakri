import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ALL_PERMISSIONS, buildPaginationMeta, ERROR_CODES, normalizeForSearch,
  PERMISSION_GROUPS, SYSTEM_ROLES, type PaginatedResponse,
} from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../common/errors';
import type { ActorContext } from '../../common/services/request-context.service';

const USER_SELECT = {
  id: true, email: true, fullName: true, phone: true, locale: true,
  isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true,
  roles: { select: { role: { select: { id: true, key: true, name: true, nameAr: true } } } },
  permissionOverrides: {
    select: { granted: true, reason: true, permission: { select: { id: true, key: true } } },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: {
    page: number; pageSize: number; q?: string; includeInactive?: boolean; roleKey?: string;
  }): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.roleKey ? { roles: { some: { role: { key: query.roleKey } } } } : {}),
      ...(query.q
        ? {
            OR: [
              { normalizedName: { contains: normalizeForSearch(query.q) } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { fullName: 'asc' },
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(id: string): Promise<unknown> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_SELECT,
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, createdAt: true, lastUsedAt: true, ipAddress: true, userAgent: true },
        },
      },
    });
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async create(
    input: { email: string; password: string; fullName: string; phone?: string | null; locale?: string; roleIds: string[] },
    ctx: ActorContext,
  ): Promise<unknown> {
    const email = input.email.toLowerCase().trim();
    if (input.password.length < 12) {
      throw new ValidationError('A password must be at least 12 characters long.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictError('A user with this email address already exists.');

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: await AuthService.hashPassword(input.password),
          fullName: input.fullName,
          normalizedName: normalizeForSearch(input.fullName),
          phone: input.phone ?? null,
          locale: input.locale ?? 'en',
        },
        select: { id: true },
      });
      for (const roleId of input.roleIds) {
        await tx.userRole.create({ data: { userId: created.id, roleId, assignedBy: ctx.actorId ?? null } });
      }
      return created;
    });

    await this.audit.record({
      action: 'USER_CREATED', entityType: 'User', entityId: user.id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { email, fullName: input.fullName, roleIds: input.roleIds },
    });
    return this.findOne(user.id);
  }

  async update(
    id: string,
    input: Partial<{ fullName: string; phone: string | null; locale: string; isActive: boolean }>,
    ctx: ActorContext,
  ): Promise<unknown> {
    const before = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('User', id);

    // Deactivating the last active Super Admin would lock everyone out.
    if (input.isActive === false) {
      await this.assertNotLastSuperAdmin(id);
    }

    const after = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined
          ? { fullName: input.fullName, normalizedName: normalizeForSearch(input.fullName) }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    if (input.isActive === false) {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'USER_DEACTIVATED' },
      });
    }

    const diff = this.audit.diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      action: 'USER_UPDATED', entityType: 'User', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: diff.before, after: diff.after, metadata: { changedFields: diff.changedFields },
    });
    return this.findOne(id);
  }

  /**
   * Replaces a user's roles.
   *
   * Two protections apply here, and both matter: nobody may change their own
   * roles (which would let any admin quietly grant themselves more), and the
   * last Super Admin cannot be demoted (which would lock the organisation out
   * of its own system).
   */
  async setRoles(id: string, roleIds: string[], ctx: ActorContext): Promise<unknown> {
    if (ctx.actorId === id) {
      throw new DomainError(
        ERROR_CODES.CANNOT_MODIFY_OWN_ACCESS,
        'You cannot change your own roles. Ask another administrator.',
        403,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, roles: { select: { role: { select: { id: true, key: true } } } } },
    });
    if (!user) throw new NotFoundError('User', id);

    const hadSuperAdmin = user.roles.some((r) => r.role.key === SYSTEM_ROLES.SUPER_ADMIN);
    const willHaveSuperAdmin = await this.prisma.role
      .findMany({ where: { id: { in: roleIds } }, select: { key: true } })
      .then((rows) => rows.some((r) => r.key === SYSTEM_ROLES.SUPER_ADMIN));

    if (hadSuperAdmin && !willHaveSuperAdmin) {
      await this.assertNotLastSuperAdmin(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      for (const roleId of roleIds) {
        await tx.userRole.create({ data: { userId: id, roleId, assignedBy: ctx.actorId ?? null } });
      }
    });

    await this.audit.record({
      action: 'USER_ROLE_CHANGED', entityType: 'User', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { roles: user.roles.map((r) => r.role.key) },
      after: { roleIds },
    });
    return this.findOne(id);
  }

  /** Grants or revokes a single permission for one user, on top of their roles. */
  async setPermissionOverride(
    id: string,
    permissionKey: string,
    granted: boolean | null,
    reason: string | undefined,
    ctx: ActorContext,
  ): Promise<unknown> {
    if (ctx.actorId === id) {
      throw new DomainError(
        ERROR_CODES.CANNOT_MODIFY_OWN_ACCESS,
        'You cannot change your own permissions. Ask another administrator.',
        403,
      );
    }

    const permission = await this.prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) throw new NotFoundError('Permission', permissionKey);

    if (granted === null) {
      await this.prisma.userPermissionOverride.deleteMany({
        where: { userId: id, permissionId: permission.id },
      });
    } else {
      await this.prisma.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: id, permissionId: permission.id } },
        create: { userId: id, permissionId: permission.id, granted, reason: reason ?? null, createdBy: ctx.actorId ?? null },
        update: { granted, reason: reason ?? null },
      });
    }

    await this.audit.record({
      action: 'USER_PERMISSION_OVERRIDE_CHANGED', entityType: 'User', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      after: { permissionKey, granted, reason },
    });
    return this.findOne(id);
  }

  async resetPassword(id: string, newPassword: string, ctx: ActorContext): Promise<void> {
    if (newPassword.length < 12) {
      throw new ValidationError('A password must be at least 12 characters long.');
    }
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundError('User', id);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await AuthService.hashPassword(newPassword) },
    });
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET_BY_ADMIN' },
    });

    await this.audit.record({
      action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
    });
  }

  /**
   * Refuses an action that would leave the system with no active Super Admin.
   */
  private async assertNotLastSuperAdmin(userId: string): Promise<void> {
    const remaining = await this.prisma.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        deletedAt: null,
        roles: { some: { role: { key: SYSTEM_ROLES.SUPER_ADMIN } } },
      },
    });
    if (remaining === 0) {
      throw new DomainError(
        ERROR_CODES.LAST_SUPER_ADMIN,
        'This is the last active Super Admin. Promote another user before removing this access.',
        409,
      );
    }
  }

  async listRoles(): Promise<unknown> {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { select: { permission: { select: { id: true, key: true, groupKey: true } } } },
        _count: { select: { users: true } },
      },
    });
  }

  async listPermissions(): Promise<unknown> {
    const rows = await this.prisma.permission.findMany({ orderBy: [{ groupKey: 'asc' }, { key: 'asc' }] });
    return { permissions: rows, groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS };
  }

  async setRolePermissions(roleId: string, permissionKeys: string[], ctx: ActorContext): Promise<unknown> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new NotFoundError('Role', roleId);

    // The Super Admin role is the recovery path; it always holds everything.
    if (role.key === SYSTEM_ROLES.SUPER_ADMIN) {
      throw new ConflictError('The Super Admin role always holds every permission and cannot be narrowed.');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
      select: { id: true, key: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      for (const p of permissions) {
        await tx.rolePermission.create({ data: { roleId, permissionId: p.id } });
      }
    });

    await this.audit.record({
      action: 'ROLE_PERMISSIONS_CHANGED', entityType: 'Role', entityId: roleId,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: { permissions: role.permissions.map((p) => p.permission.key) },
      after: { permissions: permissions.map((p) => p.key) },
    });
    return this.listRoles();
  }

  /** Signs a user out of every device. */
  async revokeSessions(id: string, ctx: ActorContext): Promise<{ revoked: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'REVOKED_BY_ADMIN' },
    });
    await this.audit.record({
      action: 'USER_SESSIONS_REVOKED', entityType: 'User', entityId: id,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, metadata: { count: result.count },
    });
    return { revoked: result.count };
  }
}
