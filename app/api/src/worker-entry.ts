import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Cloudflare Workers entry point
// This adapts the NestJS/Express app to run on Cloudflare Workers using nodejs_compat

interface Env {
  PDF_BUCKET: R2Bucket;
  // HYPERDRIVE: Hyperdrive; // For PostgreSQL via Hyperdrive
  // DB: D1Database; // For D1 database
  // CACHE: KVNamespace; // For KV cache
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Initialize NestJS app on first request (cold start)
    // In production, consider using Durable Objects or pre-warming
    const app = await createNestApp(env);
    
    // Convert Request to Express-like request
    const expressRequest = convertRequest(request, env);
    
    // Get Express-like response
    const expressResponse = createResponse();
    
    // Handle the request through Express router
    await new Promise<void>((resolve, reject) => {
      app.getHttpAdapter().getInstance().handle(expressRequest, expressResponse, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    return expressResponse.toResponse();
  }
};

let cachedApp: any = null;

async function createNestApp(env: Env) {
  if (cachedApp) return cachedApp;
  
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  
  // Validate required environment variables
  const REQUIRED_ENV_VARS = [
    'MONGO_URI',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ORIGIN',
    'PASSWORD_RESET_BASE_URL',
  ];
  
  const missing = REQUIRED_ENV_VARS.filter(key => {
    const value = config.get<string>(key);
    return !value || value.includes('change-me') || value.includes('REPLACE_ME');
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing or insecure required environment variables: ${missing.join(', ')}`);
  }
  
  app.setGlobalPrefix('api');
  
  // Helmet with relaxed CSP for Swagger
  const standardHeaders = helmet();
  const docsHeaders = helmet({ contentSecurityPolicy: false });
  app.use((req: any, res: any, next: any) => 
    (req.path.startsWith('/api/docs') ? docsHeaders : standardHeaders)(req, res, next)
  );
  
  const corsOrigin = config.get<string>('CORS_ORIGIN', '').split(',').map(o => o.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigin });
  
  app.use(require('express').json({ limit: '25mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '25mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  
  // Swagger setup
  const swagger = new DocumentBuilder()
    .setTitle('Kazmion POS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  
  // Initialize the HTTP adapter
  await app.init();
  
  cachedApp = app;
  return app;
}

function convertRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  
  const expressReq: any = {
    method: request.method,
    url: url.pathname + url.search,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    // Add R2 bucket for PDF storage
    r2: env.PDF_BUCKET,
  };
  
  // Parse body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    expressReq.body = request.clone().json().catch(() => ({}));
  }
  
  return expressReq;
}

function createResponse() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body: any = null;
  
  const expressRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    set(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    json(data: any) {
      body = data;
      headers['content-type'] = 'application/json';
      return this;
    },
    send(data: any) {
      body = data;
      return this;
    },
    toResponse() {
      return new Response(JSON.stringify(body), {
        status: statusCode,
        headers: {
          ...headers,
          'content-type': headers['content-type'] || 'application/json',
        },
      });
    },
  };
  
  return expressRes;
}