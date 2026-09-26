import { Module } from '@nestjs/common';
import { ProxyGrantController, ProxyGrantRevocationController } from './proxy-grant/proxy-grant.controller.js';
import { ConsentService } from './proxy-grant/proxy-grant.service.js';

@Module({
  controllers: [ProxyGrantController, ProxyGrantRevocationController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
