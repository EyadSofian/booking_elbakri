import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { ExcursionStatus, PERMISSIONS } from '@elbakri/shared';
import { ExcursionsService } from './excursions.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { ListQueryDto, StatusChangeDto, toDate } from '../../common/dto/common.dto';

class ItemDto {
  @IsUUID() @IsOptional() catalogItemId?: string;
  @IsString() @MaxLength(300) @IsOptional() activityRaw?: string;
  @IsDateString() @IsOptional() serviceDate?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1439) @IsOptional() serviceTimeMinutes?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxOverride?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() childOverride?: number;
  @IsBoolean() @IsOptional() transferRequired?: boolean;
  @IsBoolean() @IsOptional() guideRequired?: boolean;
  @IsString() @MaxLength(500) @IsOptional() addOns?: string;
  @IsUUID() @IsOptional() supplierPartnerId?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class CreateExcursionDto {
  @IsUUID() tripFileId!: string;
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() hotelId?: string;
  @IsString() @MaxLength(200) @IsOptional() hotelRaw?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() childCount?: number;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemDto) items!: ItemDto[];
}

/** See the note in transfers.controller.ts on why these are classes. */
class UpdateExcursionDto {
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() hotelId?: string;
  @IsString() @MaxLength(200) @IsOptional() hotelRaw?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() childCount?: number;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class UpdateItemDto extends ItemDto {
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class ExcursionListDto extends ListQueryDto {
  @IsUUID() @IsOptional() hotelId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
}

class ChangeItemStatusDto extends StatusChangeDto {
  @IsIn(Object.values(ExcursionStatus)) status!: string;
}

class DailyBoardDto {
  @IsDateString() @IsOptional() date?: string;
  @IsUUID() @IsOptional() hotelId?: string;
}

@ApiTags('excursions')
@Controller({ path: 'excursion-bookings', version: '1' })
export class ExcursionsController {
  constructor(private readonly excursions: ExcursionsService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  private toItem(dto: ItemDto) {
    return {
      catalogItemId: dto.catalogItemId ?? null,
      activityRaw: dto.activityRaw ?? null,
      serviceDate: toDate(dto.serviceDate) ?? null,
      serviceTimeMinutes: dto.serviceTimeMinutes ?? null,
      paxOverride: dto.paxOverride ?? null,
      childOverride: dto.childOverride ?? null,
      transferRequired: dto.transferRequired,
      guideRequired: dto.guideRequired,
      addOns: dto.addOns ?? null,
      supplierPartnerId: dto.supplierPartnerId ?? null,
      notes: dto.notes ?? null,
    };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.EXCURSIONS_READ)
  @ApiOperation({ summary: 'List excursion orders' })
  list(@Query() query: ExcursionListDto) {
    return this.excursions.listBookings({
      page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortDir: query.sortDir,
      q: query.q, status: query.status, hotelId: query.hotelId, partnerId: query.partnerId,
      dateFrom: toDate(query.dateFrom), dateTo: toDate(query.dateTo),
    });
  }

  @Get('daily-board')
  @RequirePermissions(PERMISSIONS.EXCURSIONS_READ)
  @ApiOperation({ summary: 'Every activity running on one day' })
  dailyBoard(@Query() query: DailyBoardDto) {
    return this.excursions.dailyBoard(toDate(query.date) ?? new Date(), query.hotelId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EXCURSIONS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.excursions.findBooking(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXCURSIONS_CREATE)
  @ApiOperation({ summary: 'Create an order with one or more activities' })
  create(@Body() dto: CreateExcursionDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.excursions.createBooking(
      {
        tripFileId: dto.tripFileId,
        leadTravelerId: dto.leadTravelerId ?? null,
        partnerId: dto.partnerId ?? null,
        hotelId: dto.hotelId ?? null,
        hotelRaw: dto.hotelRaw ?? null,
        paxCount: dto.paxCount ?? null,
        childCount: dto.childCount ?? null,
        notes: dto.notes ?? null,
        items: (dto.items ?? []).map((i) => this.toItem(i)),
      },
      this.ctx(req, actor),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EXCURSIONS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExcursionDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.excursions.updateBooking(
      id,
      {
        ...(dto.leadTravelerId !== undefined ? { leadTravelerId: dto.leadTravelerId } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.hotelId !== undefined ? { hotelId: dto.hotelId } : {}),
        ...(dto.hotelRaw !== undefined ? { hotelRaw: dto.hotelRaw } : {}),
        ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
        ...(dto.childCount !== undefined ? { childCount: dto.childCount } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post(':id/items')
  @RequirePermissions(PERMISSIONS.EXCURSIONS_UPDATE)
  @ApiOperation({ summary: 'Add another activity to an order' })
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ItemDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.excursions.addItem(id, this.toItem(dto), this.ctx(req, actor));
  }

  @Patch('items/:itemId')
  @RequirePermissions(PERMISSIONS.EXCURSIONS_UPDATE)
  updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.excursions.updateItem(
      itemId,
      {
        ...(dto.catalogItemId !== undefined ? { catalogItemId: dto.catalogItemId } : {}),
        ...(dto.activityRaw !== undefined ? { activityRaw: dto.activityRaw } : {}),
        ...(dto.serviceDate !== undefined ? { serviceDate: toDate(dto.serviceDate) ?? null } : {}),
        ...(dto.serviceTimeMinutes !== undefined ? { serviceTimeMinutes: dto.serviceTimeMinutes } : {}),
        ...(dto.paxOverride !== undefined ? { paxOverride: dto.paxOverride } : {}),
        ...(dto.childOverride !== undefined ? { childOverride: dto.childOverride } : {}),
        ...(dto.transferRequired !== undefined ? { transferRequired: dto.transferRequired } : {}),
        ...(dto.guideRequired !== undefined ? { guideRequired: dto.guideRequired } : {}),
        ...(dto.addOns !== undefined ? { addOns: dto.addOns } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post('items/:itemId/status')
  @RequirePermissions(PERMISSIONS.EXCURSIONS_UPDATE)
  changeItemStatus(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ChangeItemStatusDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.excursions.changeItemStatus(itemId, dto.status as never, dto.reason, this.ctx(req, actor));
  }
}
