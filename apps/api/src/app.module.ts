import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthzInterceptor } from '@ehr/authz';
import { AuditInterceptor } from '@ehr/audit';
import { TenantModule } from '@ehr/tenant';
import { WorkforceModule } from '@ehr/workforce';
import { DocumentsModule } from '@ehr/documents';
import { PatientModule } from '@ehr/patient';
import { SchedulingModule } from '@ehr/scheduling';
import { TasksModule } from '@ehr/tasks';
import { IntakeModule } from '@ehr/intake';
import { ClinicalModule } from '@ehr/clinical';
import { MedicationModule } from '@ehr/medication';
import { OrdersModule } from '@ehr/orders';
import { ResultsModule } from '@ehr/results';
import { BillingModule } from '@ehr/billing';
import { ClaimsModule } from '@ehr/claims';
import { PaymentsModule } from '@ehr/payments';
import { QueryModule } from '@ehr/query';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { RequestTransactionInterceptor } from './common/request-transaction.interceptor.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';

/**
 * `req.ehrContext` is attached by a genuine Fastify `onRequest` hook (main.ts, via
 * common/tenant-context.hook.ts), not Nest's `NestMiddleware`/`MiddlewareConsumer` — that
 * Express-style abstraction receives the raw `http.IncomingMessage` under
 * `@nestjs/platform-fastify`, a different object than the decorated `FastifyRequest` guards/
 * interceptors/controllers see. See tenant-context.hook.ts's doc comment.
 */
@Module({
  imports: [
    CoreModule,
    AuthModule,
    TenantModule,
    WorkforceModule,
    DocumentsModule,
    SchedulingModule,
    TasksModule,
    IntakeModule,
    PatientModule,
    ClinicalModule,
    MedicationModule,
    OrdersModule,
    ResultsModule,
    BillingModule,
    ClaimsModule,
    PaymentsModule,
    QueryModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: Nest nests global interceptors in registration order (first = outermost).
    // RequestTransactionInterceptor MUST run first so AuthzInterceptor/AuditInterceptor's
    // getCurrentTransaction() calls resolve — see each interceptor's own doc comment.
    { provide: APP_INTERCEPTOR, useClass: RequestTransactionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuthzInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
