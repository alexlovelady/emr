import { Module } from '@nestjs/common';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';
import { PractitionerController } from './practitioner/practitioner.controller.js';
import { PractitionerService } from './practitioner/practitioner.service.js';
import { PractitionerRoleController } from './practitioner-role/practitioner-role.controller.js';
import { PractitionerRoleService } from './practitioner-role/practitioner-role.service.js';
import { RoleController } from './role/role.controller.js';
import { RoleService } from './role/role.service.js';

@Module({
  controllers: [UserController, PractitionerController, PractitionerRoleController, RoleController],
  providers: [UserService, PractitionerService, PractitionerRoleService, RoleService],
  exports: [UserService, PractitionerService, PractitionerRoleService, RoleService],
})
export class WorkforceModule {}
