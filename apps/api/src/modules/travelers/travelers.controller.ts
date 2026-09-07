import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS } from '@elbakri/shared';
import { TravelersService } from './travelers.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { PaginationDto } from '../../common/dto/common.dto';

class TravelerListDto extends PaginationDto {
  @IsString() @MaxLength(200) @IsOptional() q?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() nationalityId?: string;
}

class CreateTravelerDto {
  @IsString() @MaxLength(200) fullName!: string;
  @IsString() @MaxLength(200) @IsOptional() fullNameAr?: string;
  @IsString() @MaxLength(60) @IsOptional() phone?: string;
  @IsString() @MaxLength(200) @IsOptional() email?: string;
  @IsUUID() @IsOptional() nationalityId?: string;
  @IsString() @MaxLength(120) @IsOptional() nationalityRaw?: string;
  @IsString() @MaxLength(60) @IsOptional() passportNumber?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
}

/** See the note in transfers.controller.ts on why this is a class. */
class UpdateTravelerDto {
  @IsString() @MaxLength(200) @IsOptional() fullName?: string;
  @IsString() @MaxLength(200) @IsOptional() fullNameAr?: string;
  @IsString() @MaxLength(60) @IsOptional() phone?: string;
  @IsString() @MaxLength(200) @IsOptional() email?: string;
  @IsUUID() @IsOptional() nationalityId?: string;
  @IsString() @MaxLength(120) @IsOptional() nationalityRaw?: string;
  @IsString() @MaxLength(60) @IsOptional() passportNumber?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
}

class MergeDto {
  @IsUUID() duplicateId!: string;
}

@ApiTags('travelers')
@Controller({ path: 'travelers', version: '1' })
export class TravelersController {
  constructor(private readonly travelers: TravelersService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TRAVELERS_READ)
  list(@Query() query: TravelerListDto) {
    return this.travelers.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TRAVELERS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.travelers.findOne(id);
  }

  @Get(':id/duplicates')
  @RequirePermissions(PERMISSIONS.TRAVELERS_READ)
  @ApiOperation({ summary: 'Records that might be the same person. Suggestions only.' })
  duplicates(@Param('id', ParseUUIDPipe) id: string) {
    return this.travelers.findDuplicates(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRAVELERS_CREATE)
  create(@Body() dto: CreateTravelerDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.travelers.create(dto, this.ctx(req, actor));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRAVELERS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTravelerDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.travelers.update(id, dto, this.ctx(req, actor));
  }

  @Post(':id/merge')
  @RequirePermissions(PERMISSIONS.TRAVELERS_MERGE)
  @ApiOperation({ summary: 'Merge a duplicate into this traveller. Audited and reversible.' })
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.travelers.merge(id, dto.duplicateId, this.ctx(req, actor));
  }
}
