import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConfig } from '@ehr/config';
import { startTracing, createLogger } from '@ehr/observability';
import { AppModule } from './app.module.js';
import { attachEhrContext } from './common/tenant-context.hook.js';
import { attachPortalContext } from './common/portal-context.hook.js';
import { KEY_MATERIAL, ENV_CONFIG } from './common/tokens.js';

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

  // A real Fastify hook, not Nest middleware — see tenant-context.hook.ts's doc comment for why.
  // Resolved from Nest's DI container (CoreModule's providers) after the app is built, since
  // Fastify hooks live outside Nest's class-instantiation system.
  const keys = app.get(KEY_MATERIAL);
  const envConfig = app.get(ENV_CONFIG);
  app.getHttpAdapter().getInstance().addHook('onRequest', attachEhrContext(keys, envConfig));
  app.getHttpAdapter().getInstance().addHook('onRequest', attachPortalContext(keys, envConfig));

  await app.listen(env.PORT, '0.0.0.0');
  logger.info({ port: env.PORT }, 'apps/api listening');
}

bootstrap().catch((err: unknown) => {
  console.error('[apps/api] fatal error during bootstrap:', err);
  process.exit(1);
});
