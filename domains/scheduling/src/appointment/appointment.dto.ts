import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  locationId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  appointmentType: z.string().min(1).max(200),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;

export const CancelAppointmentSchema = z.object({
  reason: z.string().min(1).max(500).nullish(),
});
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentSchema>;
