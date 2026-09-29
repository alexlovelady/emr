import { Module } from '@nestjs/common';
import { SmartEhrLaunchController } from './smart-ehr-launch.controller.js';

@Module({
  controllers: [SmartEhrLaunchController],
})
export class SmartEhrLaunchModule {}
