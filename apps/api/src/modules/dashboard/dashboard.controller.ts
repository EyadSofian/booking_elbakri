import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PERMISSIONS } from '@elbakri/shared';
import { OperationsService } from './operations.service';
import { RequirePermissions } from '../../common/decorators';
import { toDate } from '../../common/dto/common.dto';

class DayQueryDto {
  @IsDateString() @IsOptional() date?: string;
}

class UpcomingQueryDto extends DayQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(30) @IsOptional() days = 1;
}

@ApiTags('dashboard')
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly operations: OperationsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'Operational counters for a given day' })
  summary(@Query() query: DayQueryDto) {
    return this.operations.summary(toDate(query.date));
  }

  @Get('alerts')
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'Things that need action before they become problems' })
  alerts() {
    return this.operations.alerts();
  }

  @Get('activity')
  @RequirePermissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: 'Recent changes made by colleagues' })
  activity() {
    return this.operations.recentActivity();
  }

  @Get('hotel-arrivals')
  @RequirePermissions(PERMISSIONS.HOTELS_READ)
  @ApiOperation({ summary: 'Hotel check-ins for a given day' })
  hotelArrivals(@Query() query: DayQueryDto) {
    return this.operations.hotelArrivals(toDate(query.date));
  }

  @Get('upcoming-transfers')
  @RequirePermissions(PERMISSIONS.TRANSFERS_READ)
  @ApiOperation({ summary: 'Transfers due in the next N days' })
  upcomingTransfers(@Query() query: UpcomingQueryDto) {
    return this.operations.upcomingTransfers(toDate(query.date), query.days);
  }
}
