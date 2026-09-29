import { Module } from '@nestjs/common';
import { BreakglassController } from './breakglass.controller.js';

@Module({
  controllers: [BreakglassController],
})
export class BreakglassModule {}
