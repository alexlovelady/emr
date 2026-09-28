import { Module } from '@nestjs/common';
import { TerminologyController } from './terminology.controller.js';

@Module({
  controllers: [TerminologyController],
})
export class TerminologyModule {}
