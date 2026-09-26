import { Module } from '@nestjs/common';
import { OrganizationController } from './organization/organization.controller.js';
import { OrganizationService } from './organization/organization.service.js';
import { LocationController } from './location/location.controller.js';
import { LocationService } from './location/location.service.js';

@Module({
  controllers: [OrganizationController, LocationController],
  providers: [OrganizationService, LocationService],
})
export class TenantModule {}
