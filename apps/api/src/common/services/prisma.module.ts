import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ReferenceService } from './reference.service';

/**
 * Database access, available everywhere.
 *
 * Global because almost every module needs it and, more importantly, because
 * the connection pool must be a single shared instance — re-providing
 * PrismaService per module would open a pool per module.
 */
@Global()
@Module({
  providers: [PrismaService, ReferenceService],
  exports: [PrismaService, ReferenceService],
})
export class PrismaModule {}
