import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { HotelBookingStatus, PERMISSIONS } from '@elbakri/shared';
import { HotelBookingsService } from './hotel-bookings.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { ListQueryDto, StatusChangeDto, toDate } from '../../common/dto/common.dto';
import { ValidationError } from '../../common/errors';

class RoomDto {
  @IsUUID() @IsOptional() roomTypeId?: string;
  @IsString() @MaxLength(200) @IsOptional() roomTypeRaw?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() quantity?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() adults?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() children?: number;
  @IsUUID() @IsOptional() occupantTravelerId?: string;
  @IsString() @MaxLength(1000) @IsOptional() notes?: string;
}

class SegmentDto {
  @IsUUID() @IsOptional() hotelId?: string;
  @IsString() @MaxLength(200) @IsOptional() hotelRaw?: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsUUID() @IsOptional() mealPlanId?: string;
  @IsString() @MaxLength(120) @IsOptional() mealPlanRaw?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RoomDto) @IsOptional() rooms?: RoomDto[];
}

/** See the note in transfers.controller.ts on why this is a class. */
class UpdateSegmentDto {
  @IsUUID() @IsOptional() hotelId?: string;
  @IsString() @MaxLength(200) @IsOptional() hotelRaw?: string;
  @IsDateString() @IsOptional() checkIn?: string;
  @IsDateString() @IsOptional() checkOut?: string;
  @IsUUID() @IsOptional() mealPlanId?: string;
  @IsString() @MaxLength(120) @IsOptional() mealPlanRaw?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class HotelBookingListDto extends ListQueryDto {
  @IsUUID() @IsOptional() hotelId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() mealPlanId?: string;
  @IsUUID() @IsOptional() roomTypeId?: string;
  @IsUUID() @IsOptional() nationalityId?: string;
  @IsDateString() @IsOptional() checkInFrom?: string;
  @IsDateString() @IsOptional() checkInTo?: string;
  @IsDateString() @IsOptional() checkOutFrom?: string;
  @IsDateString() @IsOptional() checkOutTo?: string;
}

class CreateHotelBookingDto {
  @IsUUID() tripFileId!: string;
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() hotelId?: string;
  @IsString() @MaxLength(200) @IsOptional() hotelRaw?: string;
  @IsDateString() @IsOptional() bookingDate?: string;
  @IsString() @MaxLength(120) @IsOptional() confirmationNumber?: string;
  @IsBoolean() @IsOptional() securityApprovalRequired?: boolean;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SegmentDto) segments!: SegmentDto[];
}

class UpdateHotelBookingDto {
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() hotelId?: string;
  @IsString() @MaxLength(200) @IsOptional() hotelRaw?: string;
  @IsDateString() @IsOptional() bookingDate?: string;
  @IsString() @MaxLength(120) @IsOptional() confirmationNumber?: string;
  @IsBoolean() @IsOptional() securityApprovalRequired?: boolean;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class ChangeStatusDto extends StatusChangeDto {
  @IsIn(Object.values(HotelBookingStatus)) status!: string;
}

@ApiTags('hotel-bookings')
@Controller({ path: 'hotel-bookings', version: '1' })
export class HotelBookingsController {
  constructor(private readonly bookings: HotelBookingsService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  private toSegment(dto: SegmentDto) {
    const checkIn = toDate(dto.checkIn);
    const checkOut = toDate(dto.checkOut);
    if (!checkIn || !checkOut) throw new ValidationError('A stay needs both a check-in and a check-out date.');
    return {
      hotelId: dto.hotelId ?? null,
      hotelRaw: dto.hotelRaw ?? null,
      checkIn,
      checkOut,
      mealPlanId: dto.mealPlanId ?? null,
      mealPlanRaw: dto.mealPlanRaw ?? null,
      notes: dto.notes ?? null,
      rooms: dto.rooms?.map((r) => ({
        roomTypeId: r.roomTypeId ?? null,
        roomTypeRaw: r.roomTypeRaw ?? null,
        quantity: r.quantity ?? 1,
        adults: r.adults ?? null,
        children: r.children ?? null,
        occupantTravelerId: r.occupantTravelerId ?? null,
        notes: r.notes ?? null,
      })),
    };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.HOTELS_READ)
  @ApiOperation({ summary: 'List hotel bookings' })
  list(@Query() query: HotelBookingListDto) {
    return this.bookings.list({
      page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortDir: query.sortDir,
      q: query.q, status: query.status,
      hotelId: query.hotelId, partnerId: query.partnerId,
      mealPlanId: query.mealPlanId, roomTypeId: query.roomTypeId, nationalityId: query.nationalityId,
      checkInFrom: toDate(query.checkInFrom), checkInTo: toDate(query.checkInTo),
      checkOutFrom: toDate(query.checkOutFrom), checkOutTo: toDate(query.checkOutTo),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.HOTELS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.HOTELS_CREATE)
  @ApiOperation({ summary: 'Create a booking with one or more stay segments' })
  create(@Body() dto: CreateHotelBookingDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    if (!dto.segments?.length) throw new ValidationError('A hotel booking needs at least one stay.');
    return this.bookings.create(
      {
        tripFileId: dto.tripFileId,
        leadTravelerId: dto.leadTravelerId ?? null,
        partnerId: dto.partnerId ?? null,
        hotelId: dto.hotelId ?? null,
        hotelRaw: dto.hotelRaw ?? null,
        bookingDate: toDate(dto.bookingDate) ?? null,
        confirmationNumber: dto.confirmationNumber ?? null,
        securityApprovalRequired: dto.securityApprovalRequired,
        notes: dto.notes ?? null,
        segments: dto.segments.map((s) => this.toSegment(s)),
      },
      this.ctx(req, actor),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.HOTELS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHotelBookingDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.bookings.update(
      id,
      {
        ...(dto.leadTravelerId !== undefined ? { leadTravelerId: dto.leadTravelerId } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.hotelId !== undefined ? { hotelId: dto.hotelId } : {}),
        ...(dto.hotelRaw !== undefined ? { hotelRaw: dto.hotelRaw } : {}),
        ...(dto.bookingDate !== undefined ? { bookingDate: toDate(dto.bookingDate) ?? null } : {}),
        ...(dto.confirmationNumber !== undefined ? { confirmationNumber: dto.confirmationNumber } : {}),
        ...(dto.securityApprovalRequired !== undefined ? { securityApprovalRequired: dto.securityApprovalRequired } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post(':id/segments')
  @RequirePermissions(PERMISSIONS.HOTELS_UPDATE)
  @ApiOperation({ summary: 'Add another stay to an existing booking' })
  addSegment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SegmentDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.bookings.addSegment(id, this.toSegment(dto), this.ctx(req, actor));
  }

  @Patch('segments/:segmentId')
  @RequirePermissions(PERMISSIONS.HOTELS_UPDATE)
  updateSegment(
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
    @Body() dto: UpdateSegmentDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.bookings.updateSegment(
      segmentId,
      {
        ...(dto.hotelId !== undefined ? { hotelId: dto.hotelId } : {}),
        ...(dto.hotelRaw !== undefined ? { hotelRaw: dto.hotelRaw } : {}),
        ...(dto.checkIn !== undefined ? { checkIn: toDate(dto.checkIn) } : {}),
        ...(dto.checkOut !== undefined ? { checkOut: toDate(dto.checkOut) } : {}),
        ...(dto.mealPlanId !== undefined ? { mealPlanId: dto.mealPlanId } : {}),
        ...(dto.mealPlanRaw !== undefined ? { mealPlanRaw: dto.mealPlanRaw } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      } as never,
      this.ctx(req, actor),
    );
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.HOTELS_UPDATE)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.bookings.changeStatus(id, dto.status as never, dto.reason, this.ctx(req, actor));
  }
}
