import { createServer } from 'node:http';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { getConfig } from '@ehr/config';
import type { DB } from '@ehr/db';
import { DomainEventBus, OutboxRelay } from '@ehr/outbox';
import { BulkExportRelay } from '@ehr/bulk-export';
import { DatabaseBackupJob, BackupScheduler } from '@ehr/db-backup';
import { NoopNotificationGateway } from '@ehr/notification-adapter';
import {
  AlertEvaluator,
  AlertScheduler,
  createBackupHealthRule,
  createOutboxBacklogRule,
  createHl7DeadLetterRule,
  createMinorConsentTransitionRule,
  createBreakglassReviewRule,
} from '@ehr/alerting';
import { S3ObjectStorageGateway } from '@ehr/object-storage';
import { startTracing, createLogger, getMetrics } from '@ehr/observability';

/**
 * Connects via DATABASE_URL (the bootstrap/owner role), not APP_DATABASE_URL — see
 * OutboxRelay's own doc comment for why: it reads/updates outbox bookkeeping across every
 * tenant in one loop, which the tenant-scoped, RLS-enforcing `ehr_app` role cannot do.
 */
async function main(): Promise<void> {
  const env = getConfig();

  startTracing({
    serviceName: 'ehr-worker',
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  const logger = createLogger({ level: env.LOG_LEVEL, serviceName: 'ehr-worker' });
  const metrics = getMetrics('ehr-worker');

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: env.DATABASE_URL }) }),
  });
  const bus = new DomainEventBus();
  const relay = new OutboxRelay(db, bus, {
    pollIntervalMs: env.OUTBOX_RELAY_POLL_INTERVAL_MS,
    batchSize: env.OUTBOX_RELAY_BATCH_SIZE,
  });

  bus.on('*', (event) => {
    logger.debug({ eventType: event.event_type, aggregateId: event.aggregate_id }, 'domain event published');
  });

  // Both callbacks must never throw — a transient DB outage must not take down metrics
  // collection (or, via an unhandled rejection, the whole worker process).
  metrics.outboxPendingCount.addCallback(async (result) => {
    try {
      const row = await db
        .selectFrom('outbox_events')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('status', '=', 'pending')
        .executeTakeFirst();
      result.observe(Number(row?.count ?? 0));
    } catch (err) {
      logger.warn({ err }, 'failed to collect outbox_pending_count');
    }
  });

  metrics.outboxRelayLagSeconds.addCallback(async (result) => {
    try {
      const row = await db
        .selectFrom('outbox_events')
        .select('created_at')
        .where('status', '=', 'pending')
        .orderBy('created_at', 'asc')
        .limit(1)
        .executeTakeFirst();
      const lagSeconds = row ? (Date.now() - row.created_at.getTime()) / 1000 : 0;
      result.observe(lagSeconds);
    } catch (err) {
      logger.warn({ err }, 'failed to collect outbox_relay_lag_seconds');
    }
  });

  relay.start();
  logger.info({ pollIntervalMs: env.OUTBOX_RELAY_POLL_INTERVAL_MS }, 'outbox relay started');

  const objectStorage = new S3ObjectStorageGateway({
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    bucket: env.OBJECT_STORAGE_BUCKET,
    region: env.OBJECT_STORAGE_REGION,
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
    presignTtlSeconds: env.OBJECT_STORAGE_PRESIGN_TTL_SECONDS,
  });
  const bulkExportRelay = new BulkExportRelay(db, objectStorage, {
    pollIntervalMs: env.BULK_EXPORT_RELAY_POLL_INTERVAL_MS,
    fhirBaseUrl: `http://localhost:${env.INTEROP_FHIR_PORT}/fhir/r4`,
  });
  bulkExportRelay.start();
  logger.info({ pollIntervalMs: env.BULK_EXPORT_RELAY_POLL_INTERVAL_MS }, 'bulk export relay started');

  // Closes docs/runbooks/backup-restore.md's "no real backup schedule exists" known gap — see
  // packages/db-backup's own doc comments for the full reasoning.
  const backupJob = new DatabaseBackupJob(db, objectStorage, {
    connectionString: env.DATABASE_URL,
    pgDumpPath: env.BACKUP_PG_DUMP_PATH,
  });
  const backupScheduler = new BackupScheduler(backupJob, { intervalMs: env.BACKUP_INTERVAL_MS });
  backupScheduler.start();
  logger.info({ intervalMs: env.BACKUP_INTERVAL_MS }, 'backup scheduler started');

  // Item 18: wires packages/observability's existing metrics scaffolding to a real alerting
  // mechanism — see packages/alerting's own doc comments for the full reasoning.
  const alertEvaluator = new AlertEvaluator(
    db,
    [
      createBackupHealthRule({ staleThresholdMs: env.ALERT_BACKUP_STALE_THRESHOLD_MS }),
      createOutboxBacklogRule({ lagThresholdSeconds: env.ALERT_OUTBOX_LAG_THRESHOLD_SECONDS }),
      createHl7DeadLetterRule({ countThreshold: env.ALERT_HL7_DEAD_LETTER_THRESHOLD }),
      createMinorConsentTransitionRule({ ageThresholdYears: env.ALERT_MINOR_CONSENT_AGE_THRESHOLD_YEARS }),
      createBreakglassReviewRule(),
    ],
    new NoopNotificationGateway(),
    undefined,
    { ...(env.ALERT_NOTIFY_EMAIL ? { notifyEmail: env.ALERT_NOTIFY_EMAIL } : {}) },
  );
  const alertScheduler = new AlertScheduler(alertEvaluator, { intervalMs: env.ALERT_EVAL_INTERVAL_MS });
  alertScheduler.start();
  logger.info({ intervalMs: env.ALERT_EVAL_INTERVAL_MS }, 'alert scheduler started');

  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(env.WORKER_PORT, '0.0.0.0', () => {
    logger.info({ port: env.WORKER_PORT }, 'apps/worker health endpoint listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'apps/worker shutting down');
    relay.stop();
    bulkExportRelay.stop();
    backupScheduler.stop();
    alertScheduler.stop();
    server.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[apps/worker] fatal error during startup:', err);
  process.exit(1);
});
