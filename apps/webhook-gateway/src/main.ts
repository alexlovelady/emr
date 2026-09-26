import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConfig } from '@ehr/config';
import { startTracing, createLogger } from '@ehr/observability';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const env = getConfig();

  startTracing({
    serviceName: 'ehr-webhook-gateway',
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  const logger = createLogger({ level: env.LOG_LEVEL, serviceName: 'ehr-webhook-gateway' });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  await app.listen(env.WEBHOOK_GATEWAY_PORT, '0.0.0.0');
  logger.info({ port: env.WEBHOOK_GATEWAY_PORT }, 'apps/webhook-gateway listening');
}

bootstrap().catch((err: unknown) => {
  console.error('[apps/webhook-gateway] fatal error during bootstrap:', err);
  process.exit(1);
});
