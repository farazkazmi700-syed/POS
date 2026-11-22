import { z } from 'zod';

export const KazmiOnConfigSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform((val) => Number(val)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database (PostgreSQL primary)
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  DATABASE_POOL_SIZE: z.string().default('10').transform((val) => Number(val)),

  // Redis (queue/cache)
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string'),
  BULL_PREFIX: z.string().default('bull'),

  // Authentication
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // CORS — single source of truth for all environments
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),

  // Security
  PASSWORD_RESET_BASE_URL: z.string().url('PASSWORD_RESET_BASE_URL must be a valid URL'),
  BCRYPT_ROUNDS: z.string().default('12').transform((val) => Number(val)),

  // Storage
  STORAGE_DIR: z.string().default('./storage/record of business'),

  // Reports
  REPORT_TZ: z.string().default('Asia/Karachi'),

  // Backup
  BACKUP_MODE: z.enum(['offline', 'cloud']).default('offline'),
  BACKUP_EMAIL_TO: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587').transform((val) => Number(val)),
  SMTP_SECURE: z.string().default('false').transform((val) => val === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Twilio (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_WHATSAPP_CONTENT_SID: z.string().optional(),

  // Tenant databases (multi-tenant control plane)
  TENANT_DATABASES_FILE: z.string().optional(),

  // Worker
  WORKER_CONCURRENCY: z.string().default('2').transform((val) => Number(val)),

  // MongoDB (kept during transition period, removed after cutover)
  MONGO_URI: z.string().optional(),
});

export type KazmiOnConfig = z.infer<typeof KazmiOnConfigSchema>;

export function validateConfig(env: Record<string, string | undefined>): KazmiOnConfig {
  const result = KazmiOnConfigSchema.safeParse(env);

  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing configuration: ${missing}`);
  }

  return result.data;
}