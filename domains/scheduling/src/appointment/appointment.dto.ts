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

/** `scheduledFrom`/`scheduledTo` make "today's schedule" a real, bounded query instead of every appointment ever booked in the tenant. */
export const ListAppointmentsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  scheduledFrom: z.string().datetime().optional(),
  scheduledTo: z.string().datetime().optional(),
});
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>;
