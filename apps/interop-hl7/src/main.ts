import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConfig } from '@ehr/config';
import { startTracing, createLogger } from '@ehr/observability';
import { AppModule } from './app.module.js';
import { attachEhrContext } from './common/tenant-context.hook.js';
import { KEY_RING, OWNER_DB_CONNECTION, ENV_CONFIG } from './common/tokens.js';
import { Hl7RetryRelay } from './hl7/hl7-retry-relay.js';
import { Hl7MessageRepository } from './hl7/hl7-message.repository.js';
import { Hl7IngestionService } from './hl7/hl7.service.js';

async function bootstrap(): Promise<void> {
  const env = getConfig();

  startTracing({
    serviceName: 'ehr-interop-hl7',
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  const logger = createLogger({ level: env.LOG_LEVEL, serviceName: 'ehr-interop-hl7' });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  const keyRingStore = app.get(KEY_RING);
  const envConfig = app.get(ENV_CONFIG);
  app.getHttpAdapter().getInstance().addHook('onRequest', attachEhrContext(keyRingStore, envConfig));

  // Item 15's dead-letter/retry-scheduling mechanism — runs in-process rather than in apps/worker
  // (see Hl7RetryRelay's doc comment) since it needs the same Hl7IngestionService + full domain
  // dependency graph this app already wires up for the synchronous ingest path.
  const retryRelay = new Hl7RetryRelay(app.get(OWNER_DB_CONNECTION), app.get(Hl7IngestionService), new Hl7MessageRepository(), {
    pollIntervalMs: env.HL7_RETRY_POLL_INTERVAL_MS,
    batchSize: env.HL7_RETRY_BATCH_SIZE,
    maxAttempts: env.HL7_RETRY_MAX_ATTEMPTS,
    backoffBaseMs: env.HL7_RETRY_BACKOFF_BASE_MS,
  });
  retryRelay.start();

  const shutdown = async (): Promise<void> => {
    retryRelay.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await app.listen(env.INTEROP_HL7_PORT, '0.0.0.0');
  logger.info({ port: env.INTEROP_HL7_PORT }, 'apps/interop-hl7 listening');
}

bootstrap().catch((err: unknown) => {
  console.error('[apps/interop-hl7] fatal error during bootstrap:', err);
  process.exit(1);
});
