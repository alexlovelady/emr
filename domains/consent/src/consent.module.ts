import { Module } from '@nestjs/common';
import { ProxyGrantController, ProxyGrantRevocationController } from './proxy-grant/proxy-grant.controller.js';
import { PortalMyPatientsController } from './proxy-grant/portal-my-patients.controller.js';
import { ConsentService } from './proxy-grant/proxy-grant.service.js';

@Module({
  controllers: [ProxyGrantController, ProxyGrantRevocationController, PortalMyPatientsController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
