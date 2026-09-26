import { z } from 'zod';

/**
 * Every variable documented in .env.example must appear here. Keep the two files in sync —
 * this schema is the source of truth for what "documented" means; .env.example is for humans.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Database ---
  DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url(),

  // --- Cache ---
  REDIS_URL: z.string().url(),

  // --- Auth ---
  JWT_ISSUER: z.string().min(1).default('ehr-local'),
  JWT_AUDIENCE: z.string().min(1).default('ehr-api'),
  JWT_PRIVATE_KEY_PATH: z.string().min(1).default('./.dev/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().min(1).default('./.dev/jwt-public.pem'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(1_209_600),

  // --- Object storage ---
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_REGION: z.string().min(1).default('auto'),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  OBJECT_STORAGE_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // --- HTTP ---
  PORT: z.coerce.number().int().positive().default(3000),
  WORKER_PORT: z.coerce.number().int().positive().default(3100),
  INTEROP_FHIR_PORT: z.coerce.number().int().positive().default(3200),
  INTEROP_HL7_PORT: z.coerce.number().int().positive().default(3300),
  WEBHOOK_GATEWAY_PORT: z.coerce.number().int().positive().default(3400),

  // --- Webhook signing (apps/webhook-gateway's inbound clearinghouse callbacks, spec §12
  // "signed webhooks") ---
  WEBHOOK_SIGNING_SECRET: z.string().min(1),

  // --- Observability ---
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
  OTEL_SERVICE_NAME: z.string().min(1).default('ehr-api'),

  // --- Outbox relay ---
  OUTBOX_RELAY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().default(50),
});

export type Env = z.infer<typeof envSchema>;

/** Fallback values used only when NODE_ENV=test and a variable is not explicitly set. */
export const testEnvDefaults: Partial<Record<keyof z.input<typeof envSchema>, string>> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ehr_owner:ehr_owner_dev_password@localhost:5432/ehr_test',
  APP_DATABASE_URL: 'postgres://ehr_app:ehr_app_dev_password@localhost:5432/ehr_test',
  REDIS_URL: 'redis://localhost:6379/1',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_BUCKET: 'ehr-test-documents',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
  WEBHOOK_SIGNING_SECRET: 'test-webhook-signing-secret',
};
