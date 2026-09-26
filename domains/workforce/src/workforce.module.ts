import { Module } from '@nestjs/common';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';
import { PractitionerController } from './practitioner/practitioner.controller.js';
import { PractitionerService } from './practitioner/practitioner.service.js';

@Module({
  controllers: [UserController, PractitionerController],
  providers: [UserService, PractitionerService],
})
export class WorkforceModule {}
