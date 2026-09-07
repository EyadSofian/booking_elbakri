import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { PERMISSIONS } from '@elbakri/shared';
import { OperationsService } from './operations.service';
import { RequirePermissions } from '../../common/decorators';
import { toDate } from '../../common/dto/common.dto';

class DayQueryDto {
  @IsDateString() @IsOptional() date?: string;
}

@ApiTags('operations')
@Controller({ path: 'operations', version: '1' })
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('today')
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'The chronological operational feed for one day' })
  today(@Query() query: DayQueryDto) {
    return this.operations.timeline(toDate(query.date));
  }
}
