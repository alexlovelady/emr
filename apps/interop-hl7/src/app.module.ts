import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthzInterceptor } from '@ehr/authz';
import { AuditInterceptor } from '@ehr/audit';
import { CoreModule } from './core/core.module.js';
import { Hl7Module } from './hl7/hl7.module.js';
import { HealthController } from './health/health.controller.js';
import { RequestTransactionInterceptor } from './common/request-transaction.interceptor.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';

/**
 * Same interceptor-ordering rule as apps/api (RequestTransactionInterceptor must run first — see
 * its own doc comment). No IdempotencyInterceptor here: HL7 redelivery idempotency is handled at
 * the domain level, by `hl7_messages`' own `(tenant_id, message_control_id)` unique index — a
 * more meaningful idempotency key for this endpoint than a generic client-supplied header.
 */
@Module({
  imports: [CoreModule, Hl7Module],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestTransactionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuthzInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
