import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConfig } from '@ehr/config';
import { startTracing, createLogger } from '@ehr/observability';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const env = getConfig();

  startTracing({
    serviceName: env.OTEL_SERVICE_NAME,
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  const logger = createLogger({ level: env.LOG_LEVEL, serviceName: env.OTEL_SERVICE_NAME });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  await app.listen(env.PORT, '0.0.0.0');
  logger.info({ port: env.PORT }, 'apps/api listening');
}

bootstrap().catch((err: unknown) => {
  console.error('[apps/api] fatal error during bootstrap:', err);
  process.exit(1);
});
