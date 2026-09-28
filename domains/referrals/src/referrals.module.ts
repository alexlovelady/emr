import { Module } from '@nestjs/common';
import { PatientReferralController, ReferralDetailController } from './referral/referral.controller.js';
import { ReferralService } from './referral/referral.service.js';

@Module({
  controllers: [PatientReferralController, ReferralDetailController],
  providers: [ReferralService],
})
export class ReferralsModule {}
