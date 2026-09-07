import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './common/services/prisma.service';
import { Public } from './common/decorators';

@ApiTags('health')
// Version-neutral: a load balancer's probe should not have to track the API
// version, so these answer at /api/health as well as /api/v1/health.
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe — verifies the database is reachable' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'degraded', database: 'unreachable', timestamp: new Date().toISOString() };
    }
  }
}
