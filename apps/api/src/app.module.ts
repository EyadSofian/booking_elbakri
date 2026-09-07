import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';

import { PrismaService } from './common/services/prisma.service';
import { ReferenceService } from './common/services/reference.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { JwtAuthGuard, PermissionsGuard } from './common/guards';

import { AuditModule } from './modules/audit/audit.module';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { UsersService } from './modules/users/users.service';
import { UsersController } from './modules/users/users.controller';
import { TripsService } from './modules/trips/trips.service';
import { TripsController } from './modules/trips/trips.controller';
import { TravelersService } from './modules/travelers/travelers.service';
import { TravelersController } from './modules/travelers/travelers.controller';
import { HotelBookingsService } from './modules/hotel-bookings/hotel-bookings.service';
import { HotelBookingsController } from './modules/hotel-bookings/hotel-bookings.controller';
import { TransfersService } from './modules/transfers/transfers.service';
import { TransfersController } from './modules/transfers/transfers.controller';
import { ExcursionsService } from './modules/excursions/excursions.service';
import { ExcursionsController } from './modules/excursions/excursions.controller';
import { VisasService } from './modules/visas/visas.service';
import { VisasController } from './modules/visas/visas.controller';
import { FinanceService } from './modules/finance/finance.service';
import { FinanceController } from './modules/finance/finance.controller';
import { MasterDataService } from './modules/master-data/master-data.service';
import { MasterDataController } from './modules/master-data/master-data.controller';
import { AliasResolverService } from './modules/master-data/alias-resolver.service';
import { DataQualityService } from './modules/data-quality/data-quality.service';
import { DataQualityController } from './modules/data-quality/data-quality.controller';
import { ImportAnalyzerService } from './modules/imports/import-analyzer.service';
import { ImportApplierService } from './modules/imports/import-applier.service';
import { ImportsService } from './modules/imports/imports.service';
import { ImportsController } from './modules/imports/imports.controller';
import { OperationsService } from './modules/dashboard/operations.service';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { OperationsController } from './modules/dashboard/operations.controller';
import { ReportsService } from './modules/reports/reports.service';
import { ReportsController } from './modules/reports/reports.controller';
import { SearchService } from './modules/search/search.service';
import { SearchController } from './modules/search/search.controller';
import { NotificationsService } from './modules/notifications/notifications.service';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { ApiKeysService } from './modules/api-keys/api-keys.service';
import { ApiKeysController } from './modules/api-keys/api-keys.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 300),
        },
        // Named bucket used by the auth endpoints via @Throttle.
        {
          name: 'auth',
          ttl: 60_000,
          limit: config.get<number>('AUTH_THROTTLE_LIMIT', 10),
        },
      ],
    }),
    AuditModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    TripsController,
    TravelersController,
    HotelBookingsController,
    TransfersController,
    ExcursionsController,
    VisasController,
    FinanceController,
    MasterDataController,
    DataQualityController,
    ImportsController,
    DashboardController,
    OperationsController,
    ReportsController,
    SearchController,
    NotificationsController,
    ApiKeysController,
    SettingsController,
  ],
  providers: [
    PrismaService,
    ReferenceService,
    AuthService,
    UsersService,
    TripsService,
    TravelersService,
    HotelBookingsService,
    TransfersService,
    ExcursionsService,
    VisasService,
    FinanceService,
    MasterDataService,
    AliasResolverService,
    DataQualityService,
    ImportAnalyzerService,
    ImportApplierService,
    ImportsService,
    OperationsService,
    ReportsService,
    SearchService,
    NotificationsService,
    ApiKeysService,

    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: throttle, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
