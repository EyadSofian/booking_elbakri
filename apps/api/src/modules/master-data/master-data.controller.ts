import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS } from '@elbakri/shared';
import { MasterDataService } from './master-data.service';
import type { AliasEntityType } from './alias-resolver.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { PaginationDto, toBoolean } from '../../common/dto/common.dto';

class MasterListDto extends PaginationDto {
  @IsString() @MaxLength(200) @IsOptional() q?: string;
  @Transform(toBoolean) @IsBoolean() @IsOptional() includeInactive?: boolean;
  @IsString() @MaxLength(40) @IsOptional() kind?: string;
}

/**
 * The hotel directory's own filters.
 *
 * A real class, not an intersection: Nest's ValidationPipe skips anything whose
 * metatype is not a class, which silently disables validation and the numeric
 * coercion these filters depend on.
 */
class HotelListDto extends MasterListDto {
  @IsString() @MaxLength(120) @IsOptional() region?: string;
  @IsString() @MaxLength(40) @IsOptional() syncStatus?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) @IsOptional() starRating?: number;
  @IsString() @MaxLength(200) @IsOptional() hotelGroupName?: string;
  @IsString() @MaxLength(40) @IsOptional() sortBy?: string;
  @IsIn(['asc', 'desc']) @IsOptional() sortDir?: 'asc' | 'desc';
}

class CreatePartnerDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(200) @IsOptional() nameAr?: string;
  @IsString() @MaxLength(40) @IsOptional() type?: string;
  @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsString() @MaxLength(200) @IsOptional() email?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class CreateHotelDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(200) @IsOptional() nameAr?: string;
  @IsString() @MaxLength(120) @IsOptional() city?: string;
  @IsString() @MaxLength(120) @IsOptional() area?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() starRating?: number;
  @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class CreateDriverDto {
  @IsString() @MaxLength(200) fullName!: string;
  @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsString() @MaxLength(60) @IsOptional() licenseNumber?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class CreateVehicleDto {
  @IsString() @MaxLength(40) plateNumber!: string;
  @IsString() @MaxLength(120) @IsOptional() model?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() capacity?: number;
  @IsString() @MaxLength(40) @IsOptional() type?: string;
}

class AliasQueryDto extends PaginationDto {
  @IsString() @MaxLength(40) @IsOptional() entityType?: string;
  @IsString() @MaxLength(40) @IsOptional() status?: string;
}

class ApproveAliasDto {
  @IsUUID() targetId!: string;
}

class AddAliasDto {
  @IsString() @MaxLength(40) entityType!: string;
  @IsUUID() targetId!: string;
  @IsString() @MaxLength(200) alias!: string;
}

@ApiTags('master-data')
@Controller({ path: '', version: '1' })
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get('partners')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listPartners(@Query() query: MasterListDto) {
    return this.masterData.listPartners(query);
  }

  @Post('partners')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  createPartner(@Body() dto: CreatePartnerDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.masterData.createPartner(dto, this.ctx(req, actor));
  }

  @Get('hotels/:id')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  @ApiOperation({ summary: 'One hotel with its aliases, usage and sync state' })
  findHotel(@Param('id', ParseUUIDPipe) id: string) {
    return this.masterData.findHotel(id);
  }

  @Get('hotels')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listHotels(@Query() query: HotelListDto) {
    return this.masterData.listHotels(query);
  }

  @Post('hotels')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  createHotel(@Body() dto: CreateHotelDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.masterData.createHotel(dto, this.ctx(req, actor));
  }

  @Get('room-types')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listRoomTypes(@Query() query: MasterListDto) {
    return this.masterData.listRoomTypes(query);
  }

  @Get('meal-plans')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listMealPlans(@Query() query: MasterListDto) {
    return this.masterData.listMealPlans(query);
  }

  @Get('locations')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listLocations(@Query() query: MasterListDto) {
    return this.masterData.listLocations(query);
  }

  @Get('excursions')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listExcursionCatalog(@Query() query: MasterListDto) {
    return this.masterData.listExcursionCatalog(query);
  }

  @Get('nationalities')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listNationalities(@Query() query: MasterListDto) {
    return this.masterData.listNationalities(query);
  }

  @Get('drivers')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listDrivers(@Query() query: MasterListDto) {
    return this.masterData.listDrivers(query);
  }

  @Post('drivers')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  createDriver(@Body() dto: CreateDriverDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.masterData.createDriver(dto, this.ctx(req, actor));
  }

  @Get('vehicles')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  listVehicles(@Query() query: MasterListDto) {
    return this.masterData.listVehicles(query);
  }

  @Post('vehicles')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  createVehicle(@Body() dto: CreateVehicleDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.masterData.createVehicle(dto, this.ctx(req, actor));
  }

  @Get('alias-suggestions')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  @ApiOperation({ summary: 'Legacy values that need a person to decide what they mean' })
  listAliases(@Query() query: AliasQueryDto) {
    return this.masterData.listAliasSuggestions(query);
  }

  @Post('alias-suggestions/:id/approve')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  @ApiOperation({ summary: 'Link an unresolved value to an existing master record' })
  approveAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveAliasDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.masterData.approveAlias(id, dto.targetId, this.ctx(req, actor));
  }

  @Post('alias-suggestions/:id/promote')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  @ApiOperation({ summary: 'Create a new master record from an unresolved value' })
  promoteAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.masterData.promoteAliasToNewRecord(id, this.ctx(req, actor));
  }

  @Post('alias-suggestions/:id/reject')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  rejectAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.masterData.rejectAlias(id, this.ctx(req, actor));
  }

  @Post('aliases')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_MANAGE)
  @ApiOperation({ summary: 'Add an alias to a master record by hand' })
  addAlias(@Body() dto: AddAliasDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.masterData.addAlias(
      dto.entityType as AliasEntityType,
      dto.targetId,
      dto.alias,
      this.ctx(req, actor),
    );
  }
}
