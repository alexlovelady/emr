import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthzInterceptor } from '@ehr/authz';
import { AuditInterceptor } from '@ehr/audit';
import { TenantModule } from '@ehr/tenant';
import { WorkforceModule } from '@ehr/workforce';
import { DocumentsModule } from '@ehr/documents';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { TenantContextMiddleware } from './common/tenant-context.middleware.js';
import { RequestTransactionInterceptor } from './common/request-transaction.interceptor.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';

@Module({
  imports: [CoreModule, AuthModule, TenantModule, WorkforceModule, DocumentsModule],
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
