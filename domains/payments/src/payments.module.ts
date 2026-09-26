import { Module } from '@nestjs/common';
import { LedgerController } from './ledger/ledger.controller.js';
import { LedgerService } from './ledger/ledger.service.js';
import { EligibilityController } from './eligibility/eligibility.controller.js';
import { RemittanceController } from './remittance/remittance.controller.js';
import { ClaimTimelineController } from './claim-timeline/claim-timeline.controller.js';

@Module({
  controllers: [LedgerController, EligibilityController, RemittanceController, ClaimTimelineController],
  providers: [LedgerService],
})
export class PaymentsModule {}
