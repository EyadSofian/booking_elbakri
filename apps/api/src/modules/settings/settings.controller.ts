import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { PERMISSIONS } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';

class UpsertSettingDto {
  @IsObject() value!: Record<string, unknown>;
  @IsString() @MaxLength(500) @IsOptional() description?: string;
}

@ApiTags('settings')
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  list() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  @Put(':key')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    const ctx = toActorContext(actor, { requestId: (req as Request & { requestId?: string }).requestId, ip: req.ip });
    const before = await this.prisma.systemSetting.findUnique({ where: { key } });

    const setting = await this.prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: dto.value as Prisma.InputJsonValue,
        description: dto.description ?? null,
        updatedById: ctx.actorId ?? null,
      },
      update: {
        value: dto.value as Prisma.InputJsonValue,
        description: dto.description ?? undefined,
        updatedById: ctx.actorId ?? null,
      },
    });

    await this.audit.record({
      action: 'SETTING_UPDATED', entityType: 'SystemSetting', entityId: key,
      actorId: ctx.actorId, actorLabel: ctx.actorLabel, requestId: ctx.requestId,
      before: before?.value, after: dto.value,
    });
    return setting;
  }
}
