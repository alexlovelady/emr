import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment/appointment.controller.js';
import { AppointmentService } from './appointment/appointment.service.js';
import { ResourceController } from './resource/resource.controller.js';
import { ResourceService } from './resource/resource.service.js';

@Module({
  controllers: [AppointmentController, ResourceController],
  providers: [AppointmentService, ResourceService],
})
export class SchedulingModule {}
