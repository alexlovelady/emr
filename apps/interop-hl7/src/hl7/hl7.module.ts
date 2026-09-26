import { Module } from '@nestjs/common';
import { Hl7Controller } from './hl7.controller.js';
import { Hl7IngestionService } from './hl7.service.js';

@Module({
  controllers: [Hl7Controller],
  providers: [Hl7IngestionService],
})
export class Hl7Module {}
