import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentActor, Public, type AuthenticatedActor } from '../../common/decorators';

class LoginDto {
  @IsEmail() @MaxLength(255)
  email!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  password!: string;
}

class RefreshDto {
  @IsString() @MaxLength(500)
  refreshToken!: string;
}

class ChangePasswordDto {
  @IsString() @MaxLength(200)
  currentPassword!: string;

  @IsString() @MinLength(12) @MaxLength(200)
  newPassword!: string;
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private context(req: Request & { requestId?: string }) {
    return {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
    };
  }

  @Public()
  // Login is rate limited harder than the rest of the API to slow credential
  // stuffing without affecting normal operational traffic.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and receive an access + refresh token pair' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.auth.login(dto.email, dto.password, this.context(req));
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        id: result.actor.id,
        email: result.actor.email,
        fullName: result.actor.fullName,
        locale: result.actor.locale,
        roles: result.actor.roleKeys,
        permissions: result.actor.permissions,
      },
    };
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const result = await this.auth.refresh(dto.refreshToken, this.context(req));
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        id: result.actor.id,
        email: result.actor.email,
        fullName: result.actor.fullName,
        locale: result.actor.locale,
        roles: result.actor.roleKeys,
        permissions: result.actor.permissions,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session' })
  async logout(@CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    await this.auth.logout(actor.sessionId, actor.id, this.context(req));
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user and their effective permissions' })
  me(@CurrentActor() actor: AuthenticatedActor) {
    return {
      id: actor.id,
      email: actor.email,
      fullName: actor.fullName,
      locale: actor.locale,
      roles: actor.roleKeys,
      permissions: actor.permissions,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change your own password; signs out every other device' })
  async changePassword(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(actor.id, dto.currentPassword, dto.newPassword, this.context(req));
  }
}
