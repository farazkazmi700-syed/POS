import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CORS_ORIGIN',
  'PASSWORD_RESET_BASE_URL',
];

function validateRequiredEnv(config: ConfigService): void {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    const value = config.get<string>(key);
    if (!value || value.includes('change-me') || value.includes('REPLACE_ME')) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing or insecure required environment variables: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  validateRequiredEnv(config);

  app.setGlobalPrefix('api');
  // CSP is relaxed only so the Swagger UI at /api/docs can load its inline assets.
  const standardHeaders = helmet();
  const docsHeaders = helmet({ contentSecurityPolicy: false });
  app.use((request: Request, response: Response, next: NextFunction) => (request.path.startsWith('/api/docs') ? docsHeaders : standardHeaders)(request, response, next));
  const corsOrigin = config.get<string>('CORS_ORIGIN', '').split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigin });
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const swagger = new DocumentBuilder().setTitle('Kazmion POS API').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API ready on :${port}  (Swagger: /api/docs)`);
}
bootstrap();
