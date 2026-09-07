import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PERMISSIONS } from '@elbakri/shared';
import { ImportsService } from './imports.service';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/common.dto';
import { ValidationError } from '../../common/errors';

class IssueQueryDto extends PaginationDto {
  @IsString() @MaxLength(60) @IsOptional() severity?: string;
  @IsString() @MaxLength(60) @IsOptional() category?: string;
}

/** The subset of the multer file object this endpoint needs. */
interface UploadedWorkbook {
  originalname: string;
  buffer: Buffer;
  size: number;
}

class PreviewQueryDto {
  @IsString() @MaxLength(120) @IsOptional() sheetName?: string;
}

@ApiTags('imports')
@Controller({ path: 'imports', version: '1' })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.IMPORTS_REVIEW)
  @ApiOperation({ summary: 'List import runs' })
  list(@Query() query: PaginationDto) {
    return this.imports.list(query.page, query.pageSize);
  }

  @Post('analyze')
  @RequirePermissions(PERMISSIONS.IMPORTS_UPLOAD)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Upload a workbook and analyse it. Nothing is written to business tables.',
  })
  async analyze(
    @UploadedFile() file: UploadedWorkbook | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    if (!file) throw new ValidationError('A workbook file is required.');
    return this.imports.upload(
      { originalname: file.originalname, buffer: file.buffer, size: file.size },
      actor.id,
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.IMPORTS_REVIEW)
  @ApiOperation({ summary: 'An import run with its detected sheets' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.imports.findOne(id);
  }

  @Get(':id/issues')
  @RequirePermissions(PERMISSIONS.IMPORTS_REVIEW)
  @ApiOperation({ summary: 'Parse and mapping issues found during analysis' })
  issues(@Param('id', ParseUUIDPipe) id: string, @Query() query: IssueQueryDto) {
    return this.imports.issues(id, query.page, query.pageSize, query.severity, query.category);
  }

  @Get(':id/preview')
  @RequirePermissions(PERMISSIONS.IMPORTS_REVIEW)
  @ApiOperation({ summary: 'What the apply stage would create, without writing it' })
  preview(@Param('id', ParseUUIDPipe) id: string, @Query() query: PreviewQueryDto) {
    return this.imports.preview(id, query.sheetName);
  }

  @Get(':id/reconciliation')
  @RequirePermissions(PERMISSIONS.IMPORTS_REVIEW)
  @ApiOperation({ summary: 'Proof that every meaningful source row is accounted for' })
  reconciliation(@Param('id', ParseUUIDPipe) id: string) {
    return this.imports.reconciliation(id);
  }

  @Post(':id/apply')
  @RequirePermissions(PERMISSIONS.IMPORTS_APPLY)
  @ApiOperation({ summary: 'Write the analysed workbook into the system, in one transaction' })
  apply(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedActor) {
    return this.imports.apply(id, actor.id);
  }
}
