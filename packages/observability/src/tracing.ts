import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export interface TracingConfig {
  serviceName: string;
  otlpEndpoint?: string;
}

/**
 * Console exporters when OTLP_EXPORTER_OTLP_ENDPOINT is unset (local dev, per spec rule #10 — no
 * external vendor receives anything, even in dev). Fastify + pg auto-instrumentation only;
 * Redis/Valkey instrumentation is added once a Redis client is actually wired into an app.
 */
export function startTracing(config: TracingConfig): NodeSDK {
  const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: config.otlpEndpoint
      ? new OTLPMetricExporter({ url: `${config.otlpEndpoint}/v1/metrics` })
      : new ConsoleMetricExporter(),
    exportIntervalMillis: 30_000,
  });

  const sdk = new NodeSDK({
    resource,
    metricReader,
    ...(config.otlpEndpoint
      ? { traceExporter: new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` }) }
      : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  return sdk;
}
