import { Module } from '@nestjs/common';
import { FhirController } from './fhir.controller.js';
import { TokenController } from '../token/token.controller.js';
import { AuthorizeController } from '../token/authorize.controller.js';
import { BulkExportController } from '../bulk-export/bulk-export.controller.js';

@Module({
  controllers: [FhirController, TokenController, AuthorizeController, BulkExportController],
})
export class FhirModule {}
