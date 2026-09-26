import { Module } from '@nestjs/common';
import { PortalAuthController } from './portal-auth.controller.js';
import { PortalAuthService } from './portal-auth.service.js';

@Module({
  controllers: [PortalAuthController],
  providers: [PortalAuthService],
})
export class PortalAuthModule {}
