import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConfig } from '@ehr/config';
import { startTracing, createLogger } from '@ehr/observability';
import { AppModule } from './app.module.js';
import { attachEhrContext } from './common/tenant-context.hook.js';
import { KEY_RING, ENV_CONFIG } from './common/tokens.js';

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

  await app.listen(env.INTEROP_HL7_PORT, '0.0.0.0');
  logger.info({ port: env.INTEROP_HL7_PORT }, 'apps/interop-hl7 listening');
}

bootstrap().catch((err: unknown) => {
  console.error('[apps/interop-hl7] fatal error during bootstrap:', err);
  process.exit(1);
});
