import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment/appointment.controller.js';
import { AppointmentService } from './appointment/appointment.service.js';

@Module({
  controllers: [AppointmentController],
  providers: [AppointmentService],
})
export class SchedulingModule {}
