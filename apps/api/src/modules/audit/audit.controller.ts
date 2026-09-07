import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { buildPaginationMeta, PERMISSIONS } from '@elbakri/shared';
import { PrismaService } from '../../common/services/prisma.service';
import { RequirePermissions } from '../../common/decorators';
import { PaginationDto, toDate } from '../../common/dto/common.dto';

class AuditQueryDto extends PaginationDto {
  @IsString() @MaxLength(80) @IsOptional() action?: string;
  @IsString() @MaxLength(80) @IsOptional() entityType?: string;
  @IsString() @MaxLength(80) @IsOptional() entityId?: string;
  @IsUUID() @IsOptional() actorId?: string;
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
}

@ApiTags('audit')
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'The global audit log' })
  async list(@Query() query: AuditQueryDto) {
    const from = toDate(query.dateFrom);
    const to = toDate(query.dateTo);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  @Get('entity')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'The change history of one record' })
  async forEntity(@Query() query: AuditQueryDto) {
    return this.prisma.auditLog.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
