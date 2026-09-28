import { Module } from '@nestjs/common';
import { ClaimController, ClaimDetailController } from './claim/claim.controller.js';
import { DenialController } from './denial/denial.controller.js';
import { DenialService } from './denial/denial.service.js';
import { DenialAppealController, AppealController } from './appeal/appeal.controller.js';
import { AppealService } from './appeal/appeal.service.js';

@Module({
  controllers: [ClaimController, ClaimDetailController, DenialController, DenialAppealController, AppealController],
  providers: [DenialService, AppealService],
})
export class ClaimsModule {}
