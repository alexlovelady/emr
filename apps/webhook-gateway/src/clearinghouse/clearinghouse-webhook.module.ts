import { Module } from '@nestjs/common';
import { ClearinghouseWebhookController } from './clearinghouse-webhook.controller.js';

@Module({
  controllers: [ClearinghouseWebhookController],
})
export class ClearinghouseWebhookModule {}
