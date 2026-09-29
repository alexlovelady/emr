import { Module } from '@nestjs/common';
import { ClaimController, ClaimDetailController } from './claim/claim.controller.js';
import { DenialController, PatientDenialController } from './denial/denial.controller.js';
import { DenialService } from './denial/denial.service.js';
import { DenialAppealController, AppealController, PatientAppealController } from './appeal/appeal.controller.js';
import { AppealService } from './appeal/appeal.service.js';
import { PatientPriorAuthController, PriorAuthDetailController } from './prior-auth/prior-auth.controller.js';
import { PriorAuthorizationService } from './prior-auth/prior-auth.service.js';

@Module({
  controllers: [
    ClaimController,
    ClaimDetailController,
    DenialController,
    PatientDenialController,
    DenialAppealController,
    AppealController,
    PatientAppealController,
    PatientPriorAuthController,
    PriorAuthDetailController,
  ],
  providers: [DenialService, AppealService, PriorAuthorizationService],
})
export class ClaimsModule {}
