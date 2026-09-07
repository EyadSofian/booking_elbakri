import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PERMISSIONS } from '@elbakri/shared';
import { NotificationsService } from './notifications.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { PaginationDto, toBoolean } from '../../common/dto/common.dto';

class NotificationListDto extends PaginationDto {
  @Transform(toBoolean) @IsBoolean() @IsOptional() unreadOnly?: boolean;
}

class MarkReadDto {
  @IsArray() @IsUUID('4', { each: true }) ids!: string[];
}

@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  list(@Query() query: NotificationListDto, @CurrentActor() actor: AuthenticatedActor) {
    return this.notifications.list(actor.id, query.page, query.pageSize, query.unreadOnly);
  }

  @Get('unread-count')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  async unreadCount(@CurrentActor() actor: AuthenticatedActor) {
    return { count: await this.notifications.unreadCount(actor.id) };
  }

  @Post('mark-read')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  async markRead(@Body() dto: MarkReadDto, @CurrentActor() actor: AuthenticatedActor) {
    return { marked: await this.notifications.markRead(actor.id, dto.ids) };
  }

  @Post('mark-all-read')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  async markAllRead(@CurrentActor() actor: AuthenticatedActor) {
    return { marked: await this.notifications.markAllRead(actor.id) };
  }
}
