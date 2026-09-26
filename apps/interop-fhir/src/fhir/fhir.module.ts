import { Module } from '@nestjs/common';
import { FhirController } from './fhir.controller.js';
import { TokenController } from '../token/token.controller.js';

@Module({
  controllers: [FhirController, TokenController],
})
export class FhirModule {}
