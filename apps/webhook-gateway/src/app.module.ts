import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CoreModule } from './core/core.module.js';
import { ClearinghouseWebhookModule } from './clearinghouse/clearinghouse-webhook.module.js';
import { HealthController } from './health/health.controller.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';

/**
 * No `AuthzInterceptor`/`AuditInterceptor`/`RequestTransactionInterceptor` here — there is no
 * staff actor (the caller is an external clearinghouse, authenticated via HMAC signature, not a
 * JWT), so the usual "attach ehrContext from the JWT, then open a tenant-scoped transaction"
 * pipeline doesn't apply. Each webhook handler resolves its own tenant (via the owner-role
 * connection) and opens its own `runWithRequestTransaction` scope explicitly — see
 * `ClearinghouseWebhookService`. Audit trail for these writes is `outbox_events` only (no human
 * actor to attribute an `audit_events` row to) — see README's Phase 6 scope decisions.
 */
@Module({
  imports: [CoreModule, ClearinghouseWebhookModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
