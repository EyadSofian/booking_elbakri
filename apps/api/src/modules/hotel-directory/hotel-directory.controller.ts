import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { PERMISSIONS } from '@elbakri/shared';
import { CurrentActor, RequirePermissions, type AuthenticatedActor } from '../../common/decorators';
import { toActorContext } from '../../common/services/request-context.service';
import { HotelDirectorySyncService } from './hotel-directory-sync.service';
import { HotelDirectoryUnavailableError } from './hotel-directory.client';
import { DomainError } from '../../common/errors';

class SyncRequestDto {
  /**
   * Re-read every hotel rather than only those changed since the last run.
   * Slower, but the way to recover after an upstream correction.
   */
  @IsBoolean() @IsOptional() full?: boolean;
}

@ApiTags('hotel-directory')
@Controller({ path: 'hotel-directory', version: '1' })
export class HotelDirectoryController {
  constructor(private readonly sync: HotelDirectorySyncService) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.MASTER_DATA_READ)
  @ApiOperation({ summary: 'Configuration and the outcome of the last synchronisation' })
  async status() {
    const lastRun = await this.sync.lastRun();
    return {
      source: 'ELBAKRI Rate Hub',
      configured: this.sync.isConfigured,
      running: this.sync.isRunning,
      lastRun,
      // Stated explicitly so the UI can show it without hard-coding the claim.
      pricingImported: false,
    };
  }

  @Post('sync')
  @RequirePermissions(PERMISSIONS.HOTELS_SYNC)
  @ApiOperation({ summary: 'Pull the hotel directory from the Rate Hub' })
  async run(
    @Body() dto: SyncRequestDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: Request & { requestId?: string },
  ) {
    if (this.sync.isRunning) {
      throw new DomainError(
        'SYNC_IN_PROGRESS',
        'A hotel synchronisation is already running.',
        409,
      );
    }

    const ctx = toActorContext(actor, {
      requestId: req.requestId,
      ip: req.ip,
      headers: req.headers as Record<string, unknown>,
    });

    const last = await this.sync.lastRun();
    // An incremental run only asks for what changed since the last good sync.
    const since = dto.full || !last || last.status !== 'SUCCESS'
      ? null
      : new Date(last.startedAt);

    try {
      return await this.sync.sync(ctx, { since });
    } catch (err) {
      if (err instanceof HotelDirectoryUnavailableError) {
        // A failed sync must not read as a system fault: the catalogue is
        // still being served, it simply was not refreshed.
        throw new DomainError('HOTEL_DIRECTORY_UNAVAILABLE', err.message, 503);
      }
      throw err;
    }
  }
}
