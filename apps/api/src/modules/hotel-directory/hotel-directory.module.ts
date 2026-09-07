import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HotelDirectoryClient } from './hotel-directory.client';
import { HotelDirectorySyncService } from './hotel-directory-sync.service';
import { HotelDirectoryController } from './hotel-directory.controller';

@Module({
  imports: [AuditModule],
  controllers: [HotelDirectoryController],
  providers: [HotelDirectoryClient, HotelDirectorySyncService],
  exports: [HotelDirectorySyncService],
})
export class HotelDirectoryModule {}
