'use strict';

require('dotenv').config();

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Auth
  JWT_SECRET: z.string().optional(),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(6),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  // Bootstrap admin password on fresh DB. Optional in dev (defaults to
  // 'admin123' with a stark warning). REQUIRED in production — server will
  // refuse to create an admin without it.
  INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),

  // CORS
  CLIENT_ORIGIN: z.string().optional().default(''),

  // Storage
  USERDATA_PATH: z.string().optional(),
  LEGACY_USERDATA_PATH: z.string().optional(),

  // Google
  GOOGLE_CLIENT_ID: z.string().optional().default(''),

  // DataForSEO
  DATAFORSEO_LOGIN: z.string().optional().default(''),
  DATAFORSEO_PASSWORD: z.string().optional().default(''),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_PRICE_PERSONAL: z.string().optional().default(''),
  STRIPE_PRICE_BUSINESS: z.string().optional().default(''),
  STRIPE_PRICE_AGENCY: z.string().optional().default(''),
  STRIPE_PRICE_TOPUP: z.string().optional().default(''),
  STRIPE_SUCCESS_URL: z.string().optional().default(''),
  STRIPE_CANCEL_URL: z.string().optional().default(''),
  // Comma-separated CIDR ranges. If set, webhook requests are rejected unless
  // their source IP is in one of the ranges (in addition to signature
  // verification). Stripe publishes their range list at
  // https://stripe.com/files/ips/ips_webhooks.json — operators can paste a
  // snapshot or use the `STRIPE_WEBHOOK_IPS=auto` shortcut for the bundled list.
  STRIPE_WEBHOOK_IPS: z.string().optional().default(''),

  // Claude
  CLAUDE_API_KEY: z.string().optional().default(''),

  // Encryption-at-rest for user-saved API keys. 32 raw bytes encoded as base64
  // (44 chars). If unset, the app operates in plaintext mode with a warning.
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  MASTER_KEY: z.string().optional().default(''),

  // User agents
  SCHEMA_AUTOFILL_USER_AGENT: z.string().optional(),
  BUSINESS_AUDIT_USER_AGENT: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
// NOTE: this file deliberately uses console.error rather than the pino logger.
// `utils/logger.js` imports from here, so wiring the logger here would create
// a circular dependency. These are bootstrap errors that print before the
// logger is safe to construct.
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

// Production hard requirements
if (env.NODE_ENV === 'production') {
  const fatal = [];
  if (!env.JWT_SECRET) fatal.push('JWT_SECRET is required in production');
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    fatal.push('STRIPE_WEBHOOK_SECRET is required in production when STRIPE_SECRET_KEY is set');
  }
  if (!env.CLIENT_ORIGIN) {
    fatal.push('CLIENT_ORIGIN is required in production (CORS fails closed)');
  }
  if (fatal.length) {
    console.error('Fatal env errors:');
    for (const msg of fatal) console.error(`  - ${msg}`);
    process.exit(1);
  }
}

// Dev fallback for JWT_SECRET
const JWT_SECRET = env.JWT_SECRET || 'insecure-dev-secret-do-not-use-in-prod';

// User-agent defaults
const SCHEMA_AUTOFILL_USER_AGENT =
  env.SCHEMA_AUTOFILL_USER_AGENT ||
  'SEOToolkitSchemaBot/1.0 (+https://seo-toolkit.local)';

const BUSINESS_AUDIT_USER_AGENT =
  env.BUSINESS_AUDIT_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';

const ROBOTS_CHECKER_USER_AGENT =
  'SEOToolkitCrawlerAccessChecker/1.0 (+https://seo-toolkit.local)';

const isProd = env.NODE_ENV === 'production';
const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

module.exports = {
  env,
  isProd,
  isDev,
  isTest,
  NODE_ENV: env.NODE_ENV,
  PORT: env.PORT,
  JWT_SECRET,
  MAX_FAILED_LOGINS: env.MAX_FAILED_LOGINS,
  ACCOUNT_LOCK_MINUTES: env.ACCOUNT_LOCK_MINUTES,
  REFRESH_TOKEN_TTL_DAYS: env.REFRESH_TOKEN_TTL_DAYS,
  INITIAL_ADMIN_PASSWORD: env.INITIAL_ADMIN_PASSWORD,
  CLIENT_ORIGIN: env.CLIENT_ORIGIN,
  USERDATA_PATH: env.USERDATA_PATH,
  LEGACY_USERDATA_PATH: env.LEGACY_USERDATA_PATH,
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  DATAFORSEO_LOGIN: env.DATAFORSEO_LOGIN,
  DATAFORSEO_PASSWORD: env.DATAFORSEO_PASSWORD,
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PERSONAL: env.STRIPE_PRICE_PERSONAL,
  STRIPE_PRICE_BUSINESS: env.STRIPE_PRICE_BUSINESS,
  STRIPE_PRICE_AGENCY: env.STRIPE_PRICE_AGENCY,
  STRIPE_PRICE_TOPUP: env.STRIPE_PRICE_TOPUP,
  STRIPE_SUCCESS_URL: env.STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL: env.STRIPE_CANCEL_URL,
  STRIPE_WEBHOOK_IPS: env.STRIPE_WEBHOOK_IPS,
  CLAUDE_API_KEY: env.CLAUDE_API_KEY,
  MASTER_KEY: env.MASTER_KEY,
  SCHEMA_AUTOFILL_USER_AGENT,
  BUSINESS_AUDIT_USER_AGENT,
  ROBOTS_CHECKER_USER_AGENT,
};
