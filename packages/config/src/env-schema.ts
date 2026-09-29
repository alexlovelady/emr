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
  // Portal tokens are signed with the same KeyMaterial as staff tokens (one JWKS endpoint verifies
  // both) but carry a different audience so a staff token can never be replayed on a portal route
  // or vice versa — see packages/auth-adapter/src/portal-tokens.ts.
  PORTAL_JWT_AUDIENCE: z.string().min(1).default('ehr-portal'),
  JWT_PRIVATE_KEY_PATH: z.string().min(1).default('./.dev/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().min(1).default('./.dev/jwt-public.pem'),
  // The rotatable keyring file (packages/auth-adapter's KeyRing) — superset of the legacy single
  // private/public PEM pair above, which stay documented for first-boot migration only (see
  // loadOrCreateKeyRing). Each of the three backend apps (api, interop-fhir, interop-hl7) polls this
  // same file on KEY_RING_RELOAD_INTERVAL_MS so a rotation performed by any one process's own
  // IdentityProvider/token endpoint is picked up by the others without a restart.
  JWT_KEYRING_PATH: z.string().min(1).default('./.dev/jwt-keyring.json'),
  KEY_RING_RELOAD_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
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

  // --- Bulk FHIR $export relay ---
  BULK_EXPORT_RELAY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  // --- SMART standalone launch — where the interactive consent/patient-picker UI lives ---
  PATIENT_PORTAL_BASE_URL: z.string().url().default('http://localhost:3030'),

  // --- Scheduled database backup (packages/db-backup) ---
  BACKUP_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
  BACKUP_PG_DUMP_PATH: z.string().min(1).default('pg_dump'),

  // --- HL7 dead-letter/retry relay (apps/interop-hl7) ---
  HL7_RETRY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  HL7_RETRY_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  HL7_RETRY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  HL7_RETRY_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(60_000),

  // --- Operational alerting (packages/alerting, apps/worker) ---
  ALERT_EVAL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  ALERT_BACKUP_STALE_THRESHOLD_MS: z.coerce.number().int().positive().default(2 * 86_400_000),
  ALERT_OUTBOX_LAG_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(300),
  ALERT_HL7_DEAD_LETTER_THRESHOLD: z.coerce.number().int().positive().default(5),
  // A plain engineering default for "flag this for staff review," NOT a real state-by-state
  // age-of-majority/age-of-consent legal determination — see item 20 / minor-consent-transition
  // rule's own doc comment.
  ALERT_MINOR_CONSENT_AGE_THRESHOLD_YEARS: z.coerce.number().int().positive().default(18),
  // Empty (the default) disables notification dispatch — alerts are still evaluated/persisted and
  // readable via GET /api/v1/alerts either way; see AlertEvaluatorOptions.notifyEmail.
  ALERT_NOTIFY_EMAIL: z.string().optional().or(z.literal('')),
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
