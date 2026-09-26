import { Module } from '@nestjs/common';
import { ClaimController, ClaimDetailController } from './claim/claim.controller.js';
import { DenialController } from './denial/denial.controller.js';
import { DenialService } from './denial/denial.service.js';

@Module({
  controllers: [ClaimController, ClaimDetailController, DenialController],
  providers: [DenialService],
})
export class ClaimsModule {}
