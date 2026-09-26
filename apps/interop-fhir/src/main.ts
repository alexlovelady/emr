import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConfig } from '@ehr/config';
import { startTracing, createLogger } from '@ehr/observability';
import { AppModule } from './app.module.js';
import { attachFhirContext } from './common/fhir-context.hook.js';
import { KEY_MATERIAL, ENV_CONFIG } from './common/tokens.js';

async function bootstrap(): Promise<void> {
  const env = getConfig();

  startTracing({
    serviceName: 'ehr-interop-fhir',
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  const logger = createLogger({ level: env.LOG_LEVEL, serviceName: 'ehr-interop-fhir' });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  const keys = app.get(KEY_MATERIAL);
  const envConfig = app.get(ENV_CONFIG);
  app.getHttpAdapter().getInstance().addHook('onRequest', attachFhirContext(keys, envConfig));

  await app.listen(env.INTEROP_FHIR_PORT, '0.0.0.0');
  logger.info({ port: env.INTEROP_FHIR_PORT }, 'apps/interop-fhir listening');
}

bootstrap().catch((err: unknown) => {
  console.error('[apps/interop-fhir] fatal error during bootstrap:', err);
  process.exit(1);
});
