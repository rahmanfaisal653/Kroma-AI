import dotenv from 'dotenv';
dotenv.config();

// V5: Validate critical secrets in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'kroma-default-secret-change-me') {
    throw new Error('[FATAL] JWT_SECRET must be set in production. Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'kroma-refresh-secret-change-me') {
    throw new Error('[FATAL] JWT_REFRESH_SECRET must be set in production.');
  }
}

export const config = {
  port: Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 20202,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: String(process.env.CORS_ORIGIN || '').trim(),
  internalGatewayMode: /^(1|true|yes|on)$/i.test(String(process.env.INTERNAL_GATEWAY_MODE || '')),
  billingEnabled: /^(1|true|yes|on)$/i.test(String(process.env.BILLING_ENABLED || '')),

  // Database (local MySQL by default)
  dbProvider: String(process.env.DB_PROVIDER || 'mysql').trim().toLowerCase(),
  mysqlHost: process.env.MYSQL_HOST || '127.0.0.1',
  mysqlPort: Number(process.env.MYSQL_PORT) > 0 ? Number(process.env.MYSQL_PORT) : 3306,
  mysqlUser: process.env.MYSQL_USER || 'root',
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  mysqlDatabase: process.env.MYSQL_DATABASE || 'kroma_ai_gateway',

  // Legacy Kroombase settings kept only for rollback compatibility.
  kroombaseUrl: String(process.env.KROOMBASE_BASE_URL || 'https://kroombase.kroombox.com/rest').replace(/\/+$/, ''),
  kroombaseApiKey: process.env.KROOMBASE_API_KEY || '',
  dbTimeoutMs: Number(process.env.DB_TIMEOUT_MS) > 0 ? Number(process.env.DB_TIMEOUT_MS) : 15000,
  healthTimeoutMs: Number(process.env.HEALTH_TIMEOUT_MS) > 0 ? Number(process.env.HEALTH_TIMEOUT_MS) : 3000,

  // Optional dependencies
  chromaDbUrl: String(process.env.CHROMADB_URL || '').trim().replace(/\/+$/, ''),
  mongodbUri: String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim(),

  // Admin
  adminKey: process.env.ADMIN_KEY || '',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'kroma-default-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'kroma-refresh-secret-change-me',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  // Provider config for internal /v1 gateway
  openaiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
  openaiBaseUrl: String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, ''),
  ollamaBaseUrl: String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').trim().replace(/\/+$/, ''),
  lmstudioBaseUrl: String(process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1').trim().replace(/\/+$/, ''),

  // Gateway
  defaultTimeoutMs: Number(process.env.DEFAULT_TIMEOUT_MS) > 0 ? Number(process.env.DEFAULT_TIMEOUT_MS) : 600000,
  defaultStreamTimeoutMs: Number(process.env.DEFAULT_STREAM_TIMEOUT_MS) > 0 ? Number(process.env.DEFAULT_STREAM_TIMEOUT_MS) : 180000,
  gatewayRetryMax: Number(process.env.GATEWAY_RETRY_MAX) >= 0 ? Number(process.env.GATEWAY_RETRY_MAX) : 1,
  gatewayRetryBackoffMs: Number(process.env.GATEWAY_RETRY_BACKOFF_MS) > 0 ? Number(process.env.GATEWAY_RETRY_BACKOFF_MS) : 1200,
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX) > 0 ? Number(process.env.API_RATE_LIMIT_MAX) : 200,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) > 0 ? Number(process.env.AUTH_RATE_LIMIT_MAX) : 10,
  gatewayRateLimitMax: Number(process.env.GATEWAY_RATE_LIMIT_MAX) > 0 ? Number(process.env.GATEWAY_RATE_LIMIT_MAX) : 30,
  gatewayMaxMessages: Number(process.env.GATEWAY_MAX_MESSAGES) > 0 ? Number(process.env.GATEWAY_MAX_MESSAGES) : 16,
  allowPrivateGatewayTargets: /^(1|true|yes|on)$/i.test(String(process.env.ALLOW_PRIVATE_GATEWAY_TARGETS || '')),

  // RAG
  ragEnabled: /^(1|true|yes|on)$/i.test(String(process.env.RAG_ENABLED || '')),
  ollamaUrl: String(process.env.OLLAMA_URL || '').trim(),
  scraperApiUrl: String(process.env.SCRAPER_API_URL || process.env.SCRAPLING_API_URL || '').trim(),
  ragCacheTtlMs: Number(process.env.RAG_CACHE_TTL_MS) > 0 ? Number(process.env.RAG_CACHE_TTL_MS) : 10 * 60 * 1000,
  allowPrivateScrapeTargets: /^(1|true|yes|on)$/i.test(String(process.env.ALLOW_PRIVATE_SCRAPE_TARGETS || '')),

  // Dynamic API setting columns (expected in apis table)
  dynamicApiSettingColumns: [
    'timeout_ms', 'max_input_chars', 'speed_mode',
    'default_top_p', 'default_top_k', 'default_temperature',
    'max_tokens', 'is_streaming', 'model_slug'
  ] as const,
} as const;

export type Config = typeof config;

// --- Security Checks ---
export function validateSecurityConfig(): void {
  const warnings: string[] = [];
  
  if (!process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET tidak diset — menggunakan default yang TIDAK AMAN! Set JWT_SECRET di .env');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    warnings.push('JWT_REFRESH_SECRET tidak diset — menggunakan default yang TIDAK AMAN!');
  }
  if (config.jwtSecret === config.jwtRefreshSecret) {
    warnings.push('JWT_SECRET dan JWT_REFRESH_SECRET sama — gunakan secret yang berbeda!');
  }
  
  if (warnings.length > 0) {
    console.warn('\n⚠️  SECURITY WARNINGS:');
    warnings.forEach(w => console.warn(`   ⚠️  ${w}`));
    console.warn('');
  }
}
