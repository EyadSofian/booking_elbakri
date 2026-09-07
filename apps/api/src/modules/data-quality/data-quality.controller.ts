import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DataQualityStatus, PERMISSIONS } from '@elbakri/shared';
import { DataQualityService } from './data-quality.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/common.dto';

class IssueListDto extends PaginationDto {
  @IsString() @MaxLength(60) @IsOptional() status?: string;
  @IsString() @MaxLength(60) @IsOptional() category?: string;
  @IsString() @MaxLength(60) @IsOptional() severity?: string;
  @IsString() @MaxLength(60) @IsOptional() entityType?: string;
  @IsUUID() @IsOptional() assignedToId?: string;
  @IsUUID() @IsOptional() importRunId?: string;
  @IsString() @MaxLength(200) @IsOptional() q?: string;
}

class AssignDto {
  @IsUUID() @IsOptional() assignedToId?: string | null;
}

class ResolveDto {
  @IsIn([DataQualityStatus.RESOLVED, DataQualityStatus.IGNORED_WITH_REASON])
  status!: typeof DataQualityStatus.RESOLVED | typeof DataQualityStatus.IGNORED_WITH_REASON;

  @IsString() @MaxLength(2000) @IsOptional()
  notes?: string;
}

@ApiTags('data-quality')
@Controller({ path: 'data-quality', version: '1' })
export class DataQualityController {
  constructor(private readonly service: DataQualityService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DATA_QUALITY_READ)
  @ApiOperation({ summary: 'List data quality issues' })
  list(@Query() query: IssueListDto) {
    return this.service.list(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DATA_QUALITY_READ)
  @ApiOperation({ summary: 'Issue counts by status, category and severity' })
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DATA_QUALITY_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/assign')
  @RequirePermissions(PERMISSIONS.DATA_QUALITY_RESOLVE)
  @ApiOperation({ summary: 'Assign an issue to a colleague' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.service.assign(id, dto.assignedToId ?? null, actor.id);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.DATA_QUALITY_RESOLVE)
  @ApiOperation({ summary: 'Resolve an issue, or ignore it with a stated reason' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.service.resolve(id, dto.status, dto.notes, actor.id);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.DATA_QUALITY_RESOLVE)
  @ApiOperation({ summary: 'Reopen a closed issue' })
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.reopen(id, actor.id);
  }
}
