import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS, VisaStatus } from '@elbakri/shared';
import { VisasService } from './visas.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { ListQueryDto, StatusChangeDto, toDate } from '../../common/dto/common.dto';

class ApplicantDto {
  @IsUUID() @IsOptional() travelerId?: string;
  @IsString() @MaxLength(200) @IsOptional() fullName?: string;
  @IsString() @MaxLength(60) @IsOptional() passportNumber?: string;
  @IsDateString() @IsOptional() passportExpiry?: string;
}

class CreateVisaDto {
  @IsUUID() tripFileId!: string;
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsString() @MaxLength(200) @IsOptional() originRaw?: string;
  @IsString() @MaxLength(200) @IsOptional() destinationRaw?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @IsDateString() @IsOptional() serviceDate?: string;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() netAmount?: number;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() sellAmount?: number;
  @IsString() @MaxLength(3) @IsOptional() currency?: string;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ApplicantDto) @IsOptional() applicants?: ApplicantDto[];
}

/** See the note in transfers.controller.ts on why these are classes. */
class UpdateVisaDto {
  @IsUUID() @IsOptional() leadTravelerId?: string;
  @IsUUID() @IsOptional() partnerId?: string;
  @IsString() @MaxLength(200) @IsOptional() originRaw?: string;
  @IsString() @MaxLength(200) @IsOptional() destinationRaw?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() paxCount?: number;
  @IsDateString() @IsOptional() serviceDate?: string;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() netAmount?: number;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() sellAmount?: number;
  @IsString() @MaxLength(3) @IsOptional() currency?: string;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class UpdateApplicantDto extends ApplicantDto {
  @IsString() @MaxLength(40) @IsOptional() status?: string;
  @IsBoolean() @IsOptional() documentsComplete?: boolean;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}

class VisaListDto extends ListQueryDto {
  @IsUUID() @IsOptional() partnerId?: string;
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
  @IsString() @MaxLength(200) @IsOptional() destination?: string;
}

class ChangeVisaStatusDto extends StatusChangeDto {
  @IsIn(Object.values(VisaStatus)) status!: string;
}

@ApiTags('visas')
@Controller({ path: 'visa-orders', version: '1' })
export class VisasController {
  constructor(private readonly visas: VisasService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.VISAS_READ)
  @ApiOperation({ summary: 'List visa orders. Amounts are hidden without visas.finance.read.' })
  list(@Query() query: VisaListDto, @CurrentActor() actor: AuthenticatedActor) {
    return this.visas.list(
      {
        page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortDir: query.sortDir,
        q: query.q, status: query.status, partnerId: query.partnerId,
        dateFrom: toDate(query.dateFrom), dateTo: toDate(query.dateTo),
        destination: query.destination,
      },
      actor.permissions,
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VISAS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedActor) {
    return this.visas.findOne(id, actor.permissions);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VISAS_CREATE)
  create(@Body() dto: CreateVisaDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.visas.create(
      {
        tripFileId: dto.tripFileId,
        leadTravelerId: dto.leadTravelerId ?? null,
        partnerId: dto.partnerId ?? null,
        originRaw: dto.originRaw ?? null,
        destinationRaw: dto.destinationRaw ?? null,
        paxCount: dto.paxCount ?? null,
        serviceDate: toDate(dto.serviceDate) ?? null,
        netAmount: dto.netAmount ?? null,
        sellAmount: dto.sellAmount ?? null,
        currency: dto.currency,
        notes: dto.notes ?? null,
        applicants: dto.applicants?.map((a) => ({
          travelerId: a.travelerId ?? null,
          fullName: a.fullName ?? null,
          passportNumber: a.passportNumber ?? null,
        })),
      },
      this.ctx(req, actor),
      actor.permissions,
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.VISAS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisaDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.visas.update(
      id,
      {
        ...(dto.leadTravelerId !== undefined ? { leadTravelerId: dto.leadTravelerId } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.originRaw !== undefined ? { originRaw: dto.originRaw } : {}),
        ...(dto.destinationRaw !== undefined ? { destinationRaw: dto.destinationRaw } : {}),
        ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
        ...(dto.serviceDate !== undefined ? { serviceDate: toDate(dto.serviceDate) ?? null } : {}),
        ...(dto.netAmount !== undefined ? { netAmount: dto.netAmount } : {}),
        ...(dto.sellAmount !== undefined ? { sellAmount: dto.sellAmount } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
      actor.permissions,
    );
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.VISAS_UPDATE)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVisaStatusDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.visas.changeStatus(id, dto.status as never, dto.reason, this.ctx(req, actor));
  }

  @Post(':id/applicants')
  @RequirePermissions(PERMISSIONS.VISAS_UPDATE)
  @ApiOperation({ summary: 'Add an applicant to an order' })
  addApplicant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicantDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.visas.addApplicant(
      id,
      {
        travelerId: dto.travelerId ?? null,
        fullName: dto.fullName ?? null,
        passportNumber: dto.passportNumber ?? null,
        passportExpiry: toDate(dto.passportExpiry) ?? null,
      },
      this.ctx(req, actor),
    );
  }

  @Patch('applicants/:applicantId')
  @RequirePermissions(PERMISSIONS.VISAS_UPDATE)
  updateApplicant(
    @Param('applicantId', ParseUUIDPipe) applicantId: string,
    @Body() dto: UpdateApplicantDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.visas.updateApplicant(
      applicantId,
      {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.passportNumber !== undefined ? { passportNumber: dto.passportNumber } : {}),
        ...(dto.passportExpiry !== undefined ? { passportExpiry: toDate(dto.passportExpiry) ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.documentsComplete !== undefined ? { documentsComplete: dto.documentsComplete } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      this.ctx(req, actor),
    );
  }
}
