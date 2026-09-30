import { Module } from '@nestjs/common';
import { CareGapsController } from './care-gaps.controller.js';

@Module({
  controllers: [CareGapsController],
})
export class CareGapsModule {}
