import { Module } from '@nestjs/common';
import { SmartEhrLaunchController } from './smart-ehr-launch.controller.js';
import { SmartClientAdminController } from './smart-client-admin.controller.js';

@Module({
  controllers: [SmartEhrLaunchController, SmartClientAdminController],
})
export class SmartEhrLaunchModule {}
