docker compose psimport { KazmiOnConfigSchema, type KazmiOnConfig } from './schema';

export type EnvProfile = 'development' | 'docker' | 'production';

export function loadConfig(profile: EnvProfile = 'development'): KazmiOnConfig {
  const env = { ...process.env };

  // Profile-specific defaults
  const profileDefaults: Record<EnvProfile, Record<string, string>> = {
    development: {
      PORT: '3000',
      DATABASE_URL: 'postgresql://pos:pos@localhost:5432/pos',
      REDIS_URL: 'redis://localhost:6379/0',
      CORS_ORIGIN: 'http://localhost:5173,http://localhost:8080',
      PASSWORD_RESET_BASE_URL: 'http://localhost:5173/reset-password',
    },
    docker: {
      PORT: '3000',
      DATABASE_URL: 'postgresql://pos:pos@postgres:5432/pos',
      REDIS_URL: 'redis://redis:6379/0',
      CORS_ORIGIN: 'http://localhost:8080',
      PASSWORD_RESET_BASE_URL: 'http://localhost:8080/reset-password',
    },
    production: {
      PORT: '3000',
      CORS_ORIGIN: '', // must be set
      PASSWORD_RESET_BASE_URL: '', // must be set
    },
  };

  const defaults = profileDefaults[profile];
  for (const [key, value] of Object.entries(defaults)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }

  return KazmiOnConfigSchema.parse(env);
}

export function validateConfigFromEnv(): KazmiOnConfig {
  return KazmiOnConfigSchema.parse(process.env);
}