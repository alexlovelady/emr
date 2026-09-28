import { Module } from '@nestjs/common';
import { PortalSessionController } from './session/portal-session.controller.js';
import { PortalProfileController } from './profile/portal-profile.controller.js';
import { PortalChartController } from './chart/portal-chart.controller.js';
import { PortalPaymentController } from './payment/portal-payment.controller.js';
import { PortalExportController } from './export/portal-export.controller.js';
import { PortalSchedulingController } from './scheduling/portal-scheduling.controller.js';
import { PortalSessionService } from './session/portal-session.service.js';

@Module({
  controllers: [
    PortalSessionController,
    PortalProfileController,
    PortalChartController,
    PortalPaymentController,
    PortalExportController,
    PortalSchedulingController,
  ],
  providers: [PortalSessionService],
})
export class PortalModule {}
