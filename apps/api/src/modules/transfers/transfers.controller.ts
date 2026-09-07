import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS, TransferDirection, TransferStatus } from '@elbakri/shared';
import { TransfersService } from './transfers.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { ListQueryDto, StatusChangeDto, toBoolean, toDate } from '../../common/dto/common.dto';
import { Transform } from 'class-transformer';

class LegDto {
  @IsIn(Object.values(TransferDirection)) @IsOptional() direction?: string;
  @IsUUID() @IsOptional() fromLocationId?: string;
  @IsString() @MaxLength(200) @IsOptional() fromRaw?: string;
  @IsUUID() @IsOptional() toLocationId?: string;
  @IsString() @MaxLength(200) @IsOptional() toRaw?: string;
  @IsDateString() serviceDate!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1439) @IsOptional() pickupTimeMinutes?: number;
  @IsString() @MaxLength(40) @IsOptional() flightNumber?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @IsUUID() @IsOptional() driverId?: string;
  @IsUUID() @IsOptional() vehicleId?: string;
  @IsBoolean() @IsOptional() meetAndGreet?: boolean;
  @IsBoolean() @IsOptional() flowerBouquet?: boolean;
  @IsBoolean() @IsOptional() securityApprovalRequired?: boolean;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class CreateTransferDto {
  @IsUUID() tripFileId!: string;
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LegDto) @IsOptional() legs?: LegDto[];
}

class LegListDto extends ListQueryDto {
  @IsIn(Object.values(TransferDirection)) @IsOptional() direction?: string;
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
  @IsUUID() @IsOptional() locationId?: string;
  @IsUUID() @IsOptional() driverId?: string;
  @IsUUID() @IsOptional() vehicleId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @Transform(toBoolean) @IsBoolean() @IsOptional() unassignedOnly?: boolean;
  @Transform(toBoolean) @IsBoolean() @IsOptional() missingPickupOnly?: boolean;
}

class AssignDto {
  @IsUUID() @IsOptional() driverId?: string | null;
  @IsUUID() @IsOptional() vehicleId?: string | null;
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class ChangeLegStatusDto extends StatusChangeDto {
  @IsIn(Object.values(TransferStatus)) status!: string;
}

@ApiTags('transfers')
@Controller({ path: 'transfers', version: '1' })
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  private toLeg(dto: LegDto) {
    return {
      direction: dto.direction,
      fromLocationId: dto.fromLocationId ?? null,
      fromRaw: dto.fromRaw ?? null,
      toLocationId: dto.toLocationId ?? null,
      toRaw: dto.toRaw ?? null,
      serviceDate: toDate(dto.serviceDate),
      pickupTimeMinutes: dto.pickupTimeMinutes ?? null,
      flightNumber: dto.flightNumber ?? null,
      paxCount: dto.paxCount ?? null,
      driverId: dto.driverId ?? null,
      vehicleId: dto.vehicleId ?? null,
      meetAndGreet: dto.meetAndGreet,
      flowerBouquet: dto.flowerBouquet,
      securityApprovalRequired: dto.securityApprovalRequired,
      notes: dto.notes ?? null,
    };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TRANSFERS_READ)
  @ApiOperation({ summary: 'List transfer bookings' })
  listBookings(@Query() query: ListQueryDto & { partnerId?: string; tripFileId?: string }) {
    return this.transfers.listBookings({
      page: query.page, pageSize: query.pageSize, q: query.q, status: query.status,
      partnerId: query.partnerId, tripFileId: query.tripFileId,
    });
  }

  @Get('legs')
  @RequirePermissions(PERMISSIONS.TRANSFERS_READ)
  @ApiOperation({ summary: 'List transfer legs — powers the list and dispatch board' })
  listLegs(@Query() query: LegListDto) {
    return this.transfers.listLegs({
      page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortDir: query.sortDir,
      q: query.q, status: query.status, direction: query.direction,
      dateFrom: toDate(query.dateFrom), dateTo: toDate(query.dateTo),
      locationId: query.locationId, driverId: query.driverId, vehicleId: query.vehicleId,
      partnerId: query.partnerId,
      unassignedOnly: query.unassignedOnly, missingPickupOnly: query.missingPickupOnly,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TRANSFERS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.findBooking(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSFERS_CREATE)
  create(@Body() dto: CreateTransferDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.transfers.createBooking(
      {
        tripFileId: dto.tripFileId,
        leadTravelerId: dto.leadTravelerId ?? null,
        partnerId: dto.partnerId ?? null,
        paxCount: dto.paxCount ?? null,
        notes: dto.notes ?? null,
        legs: dto.legs?.map((l) => this.toLeg(l)),
      },
      this.ctx(req, actor),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRANSFERS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateTransferDto> & { version?: number },
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.transfers.updateBooking(
      id,
      {
        ...(dto.leadTravelerId !== undefined ? { leadTravelerId: dto.leadTravelerId } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post(':id/legs')
  @RequirePermissions(PERMISSIONS.TRANSFERS_UPDATE)
  @ApiOperation({ summary: 'Add a leg (return journey, extra transfer) to a booking' })
  addLeg(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LegDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.transfers.addLeg(id, this.toLeg(dto), this.ctx(req, actor));
  }

  @Patch('legs/:legId')
  @RequirePermissions(PERMISSIONS.TRANSFERS_UPDATE)
  updateLeg(
    @Param('legId', ParseUUIDPipe) legId: string,
    @Body() dto: Partial<LegDto> & { version?: number },
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.transfers.updateLeg(
      legId,
      {
        ...(dto.direction !== undefined ? { direction: dto.direction } : {}),
        ...(dto.fromLocationId !== undefined ? { fromLocationId: dto.fromLocationId } : {}),
        ...(dto.fromRaw !== undefined ? { fromRaw: dto.fromRaw } : {}),
        ...(dto.toLocationId !== undefined ? { toLocationId: dto.toLocationId } : {}),
        ...(dto.toRaw !== undefined ? { toRaw: dto.toRaw } : {}),
        ...(dto.serviceDate !== undefined ? { serviceDate: toDate(dto.serviceDate) } : {}),
        ...(dto.pickupTimeMinutes !== undefined ? { pickupTimeMinutes: dto.pickupTimeMinutes } : {}),
        ...(dto.flightNumber !== undefined ? { flightNumber: dto.flightNumber } : {}),
        ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.meetAndGreet !== undefined ? { meetAndGreet: dto.meetAndGreet } : {}),
        ...(dto.flowerBouquet !== undefined ? { flowerBouquet: dto.flowerBouquet } : {}),
        ...(dto.securityApprovalRequired !== undefined ? { securityApprovalRequired: dto.securityApprovalRequired } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post('legs/:legId/assign')
  @RequirePermissions(PERMISSIONS.TRANSFERS_ASSIGN)
  @ApiOperation({ summary: 'Assign a driver and vehicle to a leg' })
  assign(
    @Param('legId', ParseUUIDPipe) legId: string,
    @Body() dto: AssignDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.transfers.assignLeg(legId, dto, this.ctx(req, actor));
  }

  @Post('legs/:legId/status')
  @RequirePermissions(PERMISSIONS.TRANSFERS_STATUS_UPDATE)
  @ApiOperation({ summary: 'Move a leg through the dispatch workflow' })
  changeStatus(
    @Param('legId', ParseUUIDPipe) legId: string,
    @Body() dto: ChangeLegStatusDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.transfers.changeLegStatus(legId, dto.status as never, dto.reason, this.ctx(req, actor));
  }
}
