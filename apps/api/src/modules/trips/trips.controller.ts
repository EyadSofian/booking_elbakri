import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS, TripFileStatus } from '@elbakri/shared';
import { TripsService } from './trips.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { ListQueryDto, StatusChangeDto, toDate } from '../../common/dto/common.dto';

class TripListDto extends ListQueryDto {
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() hotelId?: string;
  @IsDateString() @IsOptional() travelFrom?: string;
  @IsDateString() @IsOptional() travelTo?: string;
}

class CreateTripDto {
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsIn(Object.values(TripFileStatus)) @IsOptional() status?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() childCount?: number;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @IsDateString() @IsOptional() travelStartDate?: string;
  @IsDateString() @IsOptional() travelEndDate?: string;
}

class UpdateTripDto extends CreateTripDto {
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class ChangeTripStatusDto extends StatusChangeDto {
  @IsIn(Object.values(TripFileStatus))
  status!: string;
}

@ApiTags('trips')
@Controller({ path: 'trips', version: '1' })
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'List trip files' })
  list(@Query() query: TripListDto) {
    return this.trips.list({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      q: query.q,
      status: query.status,
      partnerId: query.partnerId,
      hotelId: query.hotelId,
      travelFrom: toDate(query.travelFrom),
      travelTo: toDate(query.travelTo),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'One trip file with every service and its timeline' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedActor) {
    // Permissions decide server-side which fields are returned at all.
    return this.trips.findOne(id, actor.permissions);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRIPS_CREATE)
  @ApiOperation({ summary: 'Create a trip file' })
  create(@Body() dto: CreateTripDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.trips.create(
      {
        leadTravelerId: dto.leadTravelerId ?? null,
        partnerId: dto.partnerId ?? null,
        status: dto.status as never,
        paxCount: dto.paxCount ?? null,
        childCount: dto.childCount ?? null,
        notes: dto.notes ?? null,
        travelStartDate: toDate(dto.travelStartDate) ?? null,
        travelEndDate: toDate(dto.travelEndDate) ?? null,
      },
      this.ctx(req, actor),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRIPS_UPDATE)
  @ApiOperation({ summary: 'Update a trip file' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.trips.update(
      id,
      {
        ...(dto.leadTravelerId !== undefined ? { leadTravelerId: dto.leadTravelerId } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
        ...(dto.childCount !== undefined ? { childCount: dto.childCount } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.travelStartDate !== undefined ? { travelStartDate: toDate(dto.travelStartDate) ?? null } : {}),
        ...(dto.travelEndDate !== undefined ? { travelEndDate: toDate(dto.travelEndDate) ?? null } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.TRIPS_UPDATE)
  @ApiOperation({ summary: 'Move a trip file to another status' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTripStatusDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.trips.changeStatus(id, dto.status as never, dto.reason, this.ctx(req, actor));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TRIPS_CANCEL)
  @ApiOperation({ summary: 'Archive a trip file (it is never hard deleted)' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.trips.archive(id, this.ctx(req, actor));
  }
}
