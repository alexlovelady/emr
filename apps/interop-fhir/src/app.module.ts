import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module.js';
import { FhirModule } from './fhir/fhir.module.js';
import { HealthController } from './health/health.controller.js';
import { SmartScopeGuard } from './common/smart-scope.guard.js';
import { FhirExceptionFilter } from './common/fhir-exception.filter.js';

@Module({
  imports: [CoreModule, FhirModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: SmartScopeGuard },
    { provide: APP_FILTER, useClass: FhirExceptionFilter },
  ],
})
export class AppModule {}
