import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS } from '@elbakri/shared';
import { UsersService } from './users.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { PaginationDto, toBoolean } from '../../common/dto/common.dto';

class UserListDto extends PaginationDto {
  @IsString() @MaxLength(200) @IsOptional() q?: string;
  @Transform(toBoolean) @IsBoolean() @IsOptional() includeInactive?: boolean;
  @IsString() @MaxLength(60) @IsOptional() roleKey?: string;
}

class CreateUserDto {
  @IsEmail() @MaxLength(255) email!: string;
  @IsString() @MinLength(12) @MaxLength(200) password!: string;
  @IsString() @MaxLength(200) fullName!: string;
  @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsString() @MaxLength(5) @IsOptional() locale?: string;
  @IsArray() @IsUUID('4', { each: true }) roleIds!: string[];
}

class UpdateUserDto {
  @IsString() @MaxLength(200) @IsOptional() fullName?: string;
  @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsString() @MaxLength(5) @IsOptional() locale?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

class SetRolesDto {
  @IsArray() @IsUUID('4', { each: true }) roleIds!: string[];
}

class OverrideDto {
  @IsString() @MaxLength(80) permissionKey!: string;
  @IsBoolean() @IsOptional() granted?: boolean | null;
  @IsString() @MaxLength(500) @IsOptional() reason?: string;
}

class ResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(200) newPassword!: string;
}

class SetRolePermissionsDto {
  @IsArray() @IsString({ each: true }) permissionKeys!: string[];
}

@ApiTags('users')
@Controller({ path: '', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get('users')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@Query() query: UserListDto) {
    return this.users.list(query);
  }

  @Get('users/:id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post('users')
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  create(@Body() dto: CreateUserDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.users.create(dto, this.ctx(req, actor));
  }

  @Patch('users/:id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, this.ctx(req, actor));
  }

  @Post('users/:id/roles')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'Replace a user\'s roles. You cannot change your own.' })
  setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolesDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.users.setRoles(id, dto.roleIds, this.ctx(req, actor));
  }

  @Post('users/:id/permission-override')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'Grant or revoke one permission for a user. Pass granted=null to clear.' })
  setOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.users.setPermissionOverride(
      id, dto.permissionKey, dto.granted ?? null, dto.reason, this.ctx(req, actor),
    );
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.users.resetPassword(id, dto.newPassword, this.ctx(req, actor));
  }

  @Post('users/:id/revoke-sessions')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  revokeSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.users.revokeSessions(id, this.ctx(req, actor));
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  listRoles() {
    return this.users.listRoles();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  listPermissions() {
    return this.users.listPermissions();
  }

  @Post('roles/:id/permissions')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @ApiOperation({ summary: 'Set the permissions a role grants' })
  setRolePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.users.setRolePermissions(id, dto.permissionKeys, this.ctx(req, actor));
  }
}
