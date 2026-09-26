export { SchedulingModule } from './scheduling.module.js';
export { AppointmentService } from './appointment/appointment.service.js';
export { AppointmentRepository, type AppointmentRow } from './appointment/appointment.repository.js';
export {
  CreateAppointmentSchema,
  type CreateAppointmentInput,
  CancelAppointmentSchema,
  type CancelAppointmentInput,
} from './appointment/appointment.dto.js';
