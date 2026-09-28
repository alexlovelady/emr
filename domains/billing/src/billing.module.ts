import { Module } from '@nestjs/common';
import { ChargeController, ChargeDetailController, CodingQueueController } from './charge/charge.controller.js';
import { ChargeService } from './charge/charge.service.js';
import { BillingRuleController } from './billing-rule/billing-rule.controller.js';
import { BillingRuleService } from './billing-rule/billing-rule.service.js';

@Module({
  controllers: [ChargeController, ChargeDetailController, CodingQueueController, BillingRuleController],
  providers: [ChargeService, BillingRuleService],
})
export class BillingModule {}
