import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { ERROR_CODES } from '@elbakri/shared';
import { AppModule } from './app.module';
import { PrismaService } from './common/services/prisma.service';
import { corsOrigins, type AppEnv } from './config/env';
import { DomainError } from './common/errors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const env = {
    NODE_ENV: config.getOrThrow<AppEnv['NODE_ENV']>('NODE_ENV'),
    PORT: config.getOrThrow<number>('PORT'),
    CORS_ORIGINS: config.getOrThrow<string>('CORS_ORIGINS'),
    SWAGGER_ENABLED: config.get<boolean>('SWAGGER_ENABLED', true),
  } as AppEnv;

  app.use(
    helmet({
      // The API serves JSON and file downloads only; a CSP for documents would
      // add nothing here and the web app sets its own.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins(env),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Accept-Language'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 86400,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Validation failures use the same envelope as every other error.
      exceptionFactory: (errors) =>
        new DomainError(
          ERROR_CODES.VALIDATION_FAILED,
          'The submitted data is not valid.',
          400,
          {
            fields: errors.map((e) => ({
              field: e.property,
              constraints: e.constraints ? Object.values(e.constraints) : [],
            })),
          },
        ),
    }),
  );

  if (env.SWAGGER_ENABLED) {
    const swagger = new DocumentBuilder()
      .setTitle('ELBAKRI OVERSEAS — Operations API')
      .setDescription(
        'Booking, operations and finance management for ELBAKRI OVERSEAS. ' +
          'All business rules, validation and permission checks are enforced here; ' +
          'the web application renders responses from this API.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addApiKey({ type: 'apiKey', name: 'Authorization', in: 'header', description: 'ApiKey <token>' }, 'apiKey')
      .build();

    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
      customSiteTitle: 'ELBAKRI OVERSEAS API',
    });
  }

  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`ELBAKRI OVERSEAS API listening on port ${env.PORT} (${env.NODE_ENV})`);
}

void bootstrap();
