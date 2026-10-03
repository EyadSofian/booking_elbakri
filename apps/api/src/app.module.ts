import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PrismaModule } from './common/prisma.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { AuthGuard } from './common/auth.guard';
import { ActivityService } from './common/activity.service';
import { HealthController } from './health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { UsersController, UsersService } from './modules/users/users.module';
import { LookupsController, LookupsService } from './modules/lookups/lookups.module';
import { HotelBookingsController, HotelBookingsService } from './modules/ops/hotel-bookings.module';
import { TransfersController, TransfersService } from './modules/ops/transfers.module';
import { ExcursionsController, ExcursionsService } from './modules/ops/excursions.module';
import { VisasController, VisasService } from './modules/ops/visas.module';
import { FlightsController, FlightsService } from './modules/ops/flights.module';
import { AttachmentsController, AttachmentsService } from './modules/attachments/attachments.module';
import { SalesController, SalesService } from './modules/sales/sales.module';
import { DashboardController, DashboardService } from './modules/dashboard/dashboard.module';
import { ImportsController, ImportsService } from './modules/imports/imports.module';

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
          limit: config.get<number>('THROTTLE_LIMIT', 600),
        },
      ],
    }),
    PrismaModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    LookupsController,
    SalesController,
    HotelBookingsController,
    TransfersController,
    ExcursionsController,
    VisasController,
    FlightsController,
    AttachmentsController,
    DashboardController,
    ImportsController,
  ],
  providers: [
    ActivityService,
    AuthService,
    UsersService,
    LookupsService,
    SalesService,
    HotelBookingsService,
    TransfersService,
    ExcursionsService,
    VisasService,
    FlightsService,
    AttachmentsService,
    DashboardService,
    ImportsService,
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Throttle first, then sign in and check the role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
