import {
  Body, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import type { Response } from 'express';
import {
  ATTACHMENT_KINDS, ATTACHMENT_KINDS_FOR, ATTACHMENT_MAX_BYTES, ENTITY_TYPES, type AttachmentItem, type AttachmentKind,
  type EntityType,
} from '@elbakri/shared';
import { PrismaService } from '../../common/prisma.service';
import { ActivityService } from '../../common/activity.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';
import { CurrentUser, type AuthUser } from '../../common/auth';
import { SalesService } from '../sales/sales.module';

class AttachmentTargetDto {
  @IsIn(ENTITY_TYPES)
  entityType!: EntityType;

  @IsUUID()
  entityId!: string;
}

class UploadAttachmentDto extends AttachmentTargetDto {
  @IsIn(ATTACHMENT_KINDS)
  kind!: AttachmentKind;
}

interface UploadedFileData {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/**
 * What the file really is, read from its first bytes — the name and the type
 * the browser sends are not trusted. Null for anything that is not a photo,
 * a scan or a PDF.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  const head = buffer.subarray(0, 12);
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (head.length >= 5 && head.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Browsers send non-ASCII filenames (Arabic) as latin1-decoded UTF-8. */
function decodeName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

const META = {
  id: true, entityType: true, entityId: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

/**
 * Passport and ticket files kept with a booking. A file can be read or changed
 * by exactly the people who can read or change the booking it belongs to.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly sales: SalesService,
  ) {}

  /** Throws unless the booking exists and this person may use it. */
  private async assertAccess(type: EntityType, id: string, user: AuthUser, forWrite: boolean): Promise<void> {
    if (!ATTACHMENT_KINDS_FOR[type]) throw new ValidationError('This kind of booking does not take files.');

    if (type === 'SALE') {
      // Sales belong to the sales team: operations never see them.
      if (user.role === 'OPERATIONS') throw new ForbiddenError();
      await this.sales.assertVisible(id, user, forWrite);
      return;
    }

    const staff = user.role === 'ADMIN' || user.role === 'OPERATIONS';
    if (!staff && !(type === 'VISA' && user.visaAccess)) throw new ForbiddenError();

    const where = { id, deletedAt: null };
    const found =
      type === 'HOTEL' ? await this.prisma.hotelBooking.findFirst({ where, select: { id: true } })
        : type === 'VISA' ? await this.prisma.visa.findFirst({ where, select: { id: true } })
          : type === 'FLIGHT' ? await this.prisma.flight.findFirst({ where, select: { id: true } })
            : null;
    if (!found) throw new NotFoundError('Booking', id);
  }

  private toItem(row: {
    id: string; kind: AttachmentKind; fileName: string; mimeType: string; size: number; createdAt: Date;
    createdBy: { id: string; name: string } | null;
  }): AttachmentItem {
    return {
      id: row.id, kind: row.kind, fileName: row.fileName, mimeType: row.mimeType, size: row.size,
      createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
    };
  }

  async list(target: AttachmentTargetDto, user: AuthUser): Promise<AttachmentItem[]> {
    await this.assertAccess(target.entityType, target.entityId, user, false);
    const rows = await this.prisma.attachment.findMany({
      where: { entityType: target.entityType, entityId: target.entityId },
      select: META,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toItem(r));
  }

  async upload(dto: UploadAttachmentDto, file: UploadedFileData | undefined, user: AuthUser): Promise<AttachmentItem> {
    if (!file?.buffer?.length) throw new ValidationError('Choose a file to upload.');
    await this.assertAccess(dto.entityType, dto.entityId, user, true);
    if (!ATTACHMENT_KINDS_FOR[dto.entityType]?.includes(dto.kind)) {
      throw new ValidationError('This kind of file does not belong on this booking.');
    }
    const mimeType = sniffMimeType(file.buffer);
    if (!mimeType) throw new ValidationError('Only photos (JPG, PNG, WEBP) and PDF files can be uploaded.', 'UNSUPPORTED_FILE');

    const row = await this.prisma.attachment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        kind: dto.kind,
        fileName: decodeName(file.originalname).replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'file',
        mimeType,
        size: file.size,
        data: new Uint8Array(file.buffer),
        createdById: user.id,
      },
      select: META,
    });
    await this.activity.log({
      type: dto.entityType, id: dto.entityId, action: 'FILE_ADDED', userId: user.id, summary: `${dto.kind} · ${row.fileName}`,
    });
    return this.toItem(row);
  }

  /** The file itself, for someone allowed to see its booking. */
  async file(id: string, user: AuthUser): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('File', id);
    await this.assertAccess(row.entityType as EntityType, row.entityId, user, false);
    return { fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data) };
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const row = await this.prisma.attachment.findUnique({ where: { id }, select: META });
    if (!row) throw new NotFoundError('File', id);
    await this.assertAccess(row.entityType as EntityType, row.entityId, user, true);
    await this.prisma.attachment.delete({ where: { id } });
    await this.activity.log({
      type: row.entityType as EntityType, id: row.entityId, action: 'FILE_REMOVED', userId: user.id,
      summary: `${row.kind} · ${row.fileName}`,
    });
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller({ path: 'attachments', version: '1' })
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  list(@Query() q: AttachmentTargetDto, @CurrentUser() user: AuthUser) {
    return this.service.list(q, user);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 } }))
  upload(@Body() dto: UploadAttachmentDto, @UploadedFile() file: UploadedFileData | undefined, @CurrentUser() user: AuthUser) {
    return this.service.upload(dto, file, user);
  }

  @Get(':id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const f = await this.service.file(id, user);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', String(f.data.length));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
    // Passport scans are personal data: never cached by a shared cache, never re-interpreted.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(f.data);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
