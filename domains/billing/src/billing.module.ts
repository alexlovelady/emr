import { Module } from '@nestjs/common';
import { ChargeController, ChargeDetailController, CodingQueueController } from './charge/charge.controller.js';
import { ChargeService } from './charge/charge.service.js';

@Module({
  controllers: [ChargeController, ChargeDetailController, CodingQueueController],
  providers: [ChargeService],
})
export class BillingModule {}
