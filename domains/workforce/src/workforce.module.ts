import { Module } from '@nestjs/common';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';
import { PractitionerController } from './practitioner/practitioner.controller.js';
import { PractitionerService } from './practitioner/practitioner.service.js';
import { RoleController } from './role/role.controller.js';
import { RoleService } from './role/role.service.js';

@Module({
  controllers: [UserController, PractitionerController, RoleController],
  providers: [UserService, PractitionerService, RoleService],
})
export class WorkforceModule {}
