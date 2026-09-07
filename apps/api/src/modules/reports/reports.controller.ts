import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';
import type { Response } from 'express';
import { PERMISSIONS } from '@elbakri/shared';
import { ReportsService, type ReportKey } from './reports.service';
import { RequirePermissions } from '../../common/decorators';
import { toArray, toBoolean, toDate } from '../../common/dto/common.dto';

class ReportQueryDto {
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsUUID() @IsOptional() hotelId?: string;
  @Transform(toArray) @IsArray() @IsOptional() status?: string[];
  @Transform(toBoolean) @IsBoolean() @IsOptional() legacyLayout?: boolean;
}

const AVAILABLE: ReportKey[] = [
  'hotel-bookings', 'transfers', 'excursions', 'visas',
  'payables', 'payments', 'outstanding', 'todays-operations', 'agency', 'hotel',
];

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @ApiOperation({ summary: 'The reports that can be exported' })
  list() {
    return {
      reports: AVAILABLE.map((key) => ({
        key,
        // Legacy layout reproduces the original spreadsheet columns exactly.
        supportsLegacyLayout: ['hotel-bookings', 'transfers', 'excursions', 'visas'].includes(key),
      })),
    };
  }

  @Get(':key.xlsx')
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @ApiOperation({ summary: 'Download a filtered report as an Excel workbook' })
  async download(
    @Param('key') key: string,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.reports.generate(key as ReportKey, {
      dateFrom: toDate(query.dateFrom),
      dateTo: toDate(query.dateTo),
      partnerId: query.partnerId,
      hotelId: query.hotelId,
      status: query.status,
      legacyLayout: query.legacyLayout,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
