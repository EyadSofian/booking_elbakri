import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS } from '@elbakri/shared';
import { ApiKeysService } from './api-keys.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { toDate } from '../../common/dto/common.dto';

class CreateApiKeyDto {
  @IsString() @MaxLength(120) name!: string;
  @IsArray() @IsString({ each: true }) scopes!: string[];
  @IsDateString() @IsOptional() expiresAt?: string;
}

@ApiTags('api-keys')
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.API_KEYS_MANAGE)
  list() {
    return this.apiKeys.list();
  }

  @Get('scopes')
  @RequirePermissions(PERMISSIONS.API_KEYS_CREATE)
  @ApiOperation({ summary: 'The read-only scopes a key can be granted' })
  scopes() {
    return this.apiKeys.scopes();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.API_KEYS_CREATE)
  @ApiOperation({ summary: 'Issue a key. The secret is shown once and never stored.' })
  create(@Body() dto: CreateApiKeyDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.apiKeys.create(
      { name: dto.name, scopes: dto.scopes, expiresAt: toDate(dto.expiresAt) ?? null },
      this.ctx(req, actor),
    );
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.API_KEYS_MANAGE)
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.apiKeys.revoke(id, this.ctx(req, actor));
  }
}
