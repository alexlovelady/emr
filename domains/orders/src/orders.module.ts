import { Module } from '@nestjs/common';
import { OrderController } from './order/order.controller.js';
import { SpecimenController } from './specimen/specimen.controller.js';
import { SpecimenService } from './specimen/specimen.service.js';

@Module({
  controllers: [OrderController, SpecimenController],
  providers: [SpecimenService],
})
export class OrdersModule {}
