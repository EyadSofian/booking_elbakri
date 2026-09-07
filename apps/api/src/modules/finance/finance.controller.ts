import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import type { Request } from 'express';
import { PaymentMethod, PERMISSIONS } from '@elbakri/shared';
import { FinanceService } from './finance.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { ListQueryDto, PaginationDto, toBoolean, toDate } from '../../common/dto/common.dto';

class DocumentListDto extends ListQueryDto {
  @IsUUID() @IsOptional() counterpartyId?: string;
  @IsUUID() @IsOptional() tripFileId?: string;
  @IsDateString() @IsOptional() dueFrom?: string;
  @IsDateString() @IsOptional() dueTo?: string;
  @Transform(toBoolean) @IsBoolean() @IsOptional() onlyOutstanding?: boolean;
  @Transform(toBoolean) @IsBoolean() @IsOptional() onlyOverdue?: boolean;
}

class CreateDocumentDto {
  @IsIn(['PAYABLE', 'RECEIVABLE']) @IsOptional() type?: string;
  @IsUUID() @IsOptional() counterpartyId?: string;
  @IsUUID() @IsOptional() tripFileId?: string;
  @IsUUID() @IsOptional() hotelBookingId?: string;
  @IsString() @MaxLength(500) @IsOptional() serviceDescription?: string;
  @Type(() => Number) @IsNumber() @Min(0) totalAmount!: number;
  @IsString() @MaxLength(3) @IsOptional() currency?: string;
  @IsDateString() @IsOptional() issueDate?: string;
  @IsDateString() @IsOptional() dueDate?: string;
  @IsDateString() @IsOptional() serviceDate?: string;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
}

/** See the note in transfers.controller.ts on why these are classes. */
class SettlementListDto extends PaginationDto {
  @IsUUID() @IsOptional() partnerId?: string;
  @IsString() @MaxLength(30) @IsOptional() status?: string;
}

class UpdateDocumentDto {
  @IsUUID() @IsOptional() counterpartyId?: string;
  @IsString() @MaxLength(500) @IsOptional() serviceDescription?: string;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() totalAmount?: number;
  @IsDateString() @IsOptional() dueDate?: string;
  @IsDateString() @IsOptional() serviceDate?: string;
  @IsString() @MaxLength(4000) @IsOptional() notes?: string;
  @Type(() => Number) @IsInt() @IsOptional() version?: number;
}

class RecordPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() paymentDate!: string;
  @IsIn(Object.values(PaymentMethod)) @IsOptional() method?: string;
  @IsString() @MaxLength(120) @IsOptional() paymentReference?: string;
  @IsString() @MaxLength(3) @IsOptional() currency?: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
  @IsBoolean() @IsOptional() allowOverpayment?: boolean;
}

class ReversePaymentDto {
  @IsString() @MaxLength(1000) reason!: string;
}

class PaymentListDto extends PaginationDto {
  @IsUUID() @IsOptional() counterpartyId?: string;
  @IsUUID() @IsOptional() documentId?: string;
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
  @IsString() @MaxLength(30) @IsOptional() status?: string;
}

@ApiTags('finance')
@Controller({ path: '', version: '1' })
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  private ctx(req: Request & { requestId?: string }, actor: AuthenticatedActor) {
    return toActorContext(actor, { requestId: req.requestId, ip: req.ip, headers: req.headers as Record<string, unknown> });
  }

  @Get('finance/overview')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Finance headline figures, all derived from the ledger' })
  overview() {
    return this.finance.overview();
  }

  @Get('finance/reconciliation')
  @RequirePermissions(PERMISSIONS.FINANCE_RECONCILE)
  @ApiOperation({ summary: 'Imported rows where the legacy REST disagrees with the ledger' })
  reconciliation(@Query() query: PaginationDto) {
    return this.finance.reconciliationReport(query.page, query.pageSize);
  }

  @Get('financial-documents')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'List payables and receivables' })
  listDocuments(@Query() query: DocumentListDto) {
    return this.finance.listDocuments({
      page: query.page, pageSize: query.pageSize, sortBy: query.sortBy, sortDir: query.sortDir,
      q: query.q, status: query.status, counterpartyId: query.counterpartyId, tripFileId: query.tripFileId,
      dueFrom: toDate(query.dueFrom), dueTo: toDate(query.dueTo),
      onlyOutstanding: query.onlyOutstanding, onlyOverdue: query.onlyOverdue,
    });
  }

  @Get('financial-documents/:id')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'A document with its payment history and legacy reconciliation' })
  findDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.findDocument(id);
  }

  @Post('financial-documents')
  @RequirePermissions(PERMISSIONS.FINANCE_DOCUMENTS_MANAGE)
  createDocument(@Body() dto: CreateDocumentDto, @CurrentActor() actor: AuthenticatedActor, @Req() req: Request) {
    return this.finance.createDocument(
      {
        type: dto.type,
        counterpartyId: dto.counterpartyId ?? null,
        tripFileId: dto.tripFileId ?? null,
        hotelBookingId: dto.hotelBookingId ?? null,
        serviceDescription: dto.serviceDescription ?? null,
        totalAmount: dto.totalAmount,
        currency: dto.currency,
        issueDate: toDate(dto.issueDate) ?? null,
        dueDate: toDate(dto.dueDate) ?? null,
        serviceDate: toDate(dto.serviceDate) ?? null,
        notes: dto.notes ?? null,
      },
      this.ctx(req, actor),
    );
  }

  @Patch('financial-documents/:id')
  @RequirePermissions(PERMISSIONS.FINANCE_DOCUMENTS_MANAGE)
  updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.finance.updateDocument(
      id,
      {
        ...(dto.counterpartyId !== undefined ? { counterpartyId: dto.counterpartyId } : {}),
        ...(dto.serviceDescription !== undefined ? { serviceDescription: dto.serviceDescription } : {}),
        ...(dto.totalAmount !== undefined ? { totalAmount: dto.totalAmount } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: toDate(dto.dueDate) ?? null } : {}),
        ...(dto.serviceDate !== undefined ? { serviceDate: toDate(dto.serviceDate) ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: dto.version,
      },
      this.ctx(req, actor),
    );
  }

  @Post('financial-documents/:id/payments')
  @RequirePermissions(PERMISSIONS.FINANCE_PAYMENTS_CREATE)
  @ApiOperation({ summary: 'Record a payment. The balance is recalculated, never typed.' })
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.finance.recordPayment(
      id,
      {
        amount: dto.amount,
        paymentDate: toDate(dto.paymentDate) ?? new Date(),
        method: dto.method,
        paymentReference: dto.paymentReference ?? null,
        currency: dto.currency,
        notes: dto.notes ?? null,
        allowOverpayment: dto.allowOverpayment,
      },
      this.ctx(req, actor),
    );
  }

  @Get('payments')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listPayments(@Query() query: PaymentListDto) {
    return this.finance.listPayments({
      page: query.page, pageSize: query.pageSize,
      counterpartyId: query.counterpartyId, documentId: query.documentId,
      dateFrom: toDate(query.dateFrom), dateTo: toDate(query.dateTo), status: query.status,
    });
  }

  @Post('payments/:id/reverse')
  @RequirePermissions(PERMISSIONS.FINANCE_PAYMENTS_REVERSE)
  @ApiOperation({ summary: 'Reverse a payment. The original entry is kept, not deleted.' })
  reversePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePaymentDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request,
  ) {
    return this.finance.reversePayment(id, dto.reason, this.ctx(req, actor));
  }

  @Get('settlements')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listSettlements(@Query() query: SettlementListDto) {
    return this.finance.listSettlements({
      page: query.page, pageSize: query.pageSize,
      partnerId: query.partnerId, status: query.status,
    });
  }

  @Get('partners/:id/ledger')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Running balance with one partner' })
  partnerLedger(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.partnerLedger(id);
  }
}
