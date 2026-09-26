import { metrics, type Counter, type ObservableGauge } from '@opentelemetry/api';

/**
 * Phase-1-scoped seeds of spec §19's workflow-health telemetry — only what actually exists yet
 * (HTTP requests, authz denials, audit events, outbox lag/backlog). Later phases add the rest
 * (oldest unreviewed critical result, unsigned notes by age, claim submission failures, etc.) as
 * those domains are built; this module is the one place new metrics get registered.
 */
export interface EhrMetrics {
  httpRequestsTotal: Counter;
  authzDeniedTotal: Counter;
  auditEventsTotal: Counter;
  outboxPendingCount: ObservableGauge;
  outboxRelayLagSeconds: ObservableGauge;
}

let cached: EhrMetrics | undefined;

export function getMetrics(meterName = 'ehr'): EhrMetrics {
  if (cached) return cached;

  const meter = metrics.getMeter(meterName);
  cached = {
    httpRequestsTotal: meter.createCounter('http_requests_total', {
      description: 'Total HTTP requests handled, by route and status.',
    }),
    authzDeniedTotal: meter.createCounter('authz_denied_total', {
      description: 'Total requests denied by PolicyEngine, by denying layer.',
    }),
    auditEventsTotal: meter.createCounter('audit_events_total', {
      description: 'Total audit_events rows written, by action and outcome.',
    }),
    outboxPendingCount: meter.createObservableGauge('outbox_pending_count', {
      description: 'Rows in outbox_events with status=pending at last relay tick.',
    }),
    outboxRelayLagSeconds: meter.createObservableGauge('outbox_relay_lag_seconds', {
      description: 'Age of the oldest pending outbox_events row, in seconds, at last relay tick.',
    }),
  };
  return cached;
}
