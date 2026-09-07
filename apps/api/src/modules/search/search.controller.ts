import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PERMISSIONS } from '@elbakri/shared';
import { SearchService } from './search.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';

class SearchQueryDto {
  @IsString() @MaxLength(200) q!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) @IsOptional() limit = 8;
}

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'Global search across every major entity, permission filtered' })
  find(@Query() query: SearchQueryDto, @CurrentActor() actor: AuthenticatedActor) {
    return this.search.search(query.q, actor.permissions, query.limit);
  }
}
