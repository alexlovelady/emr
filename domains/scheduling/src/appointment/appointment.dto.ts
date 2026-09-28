import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  locationId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  appointmentType: z.string().min(1).max(200),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  /** Rooms/equipment to book alongside the practitioner — each is conflict-checked too. */
  resourceIds: z.array(z.string().uuid()).optional(),
  /** Explicit escape hatch for a practice that intentionally double-books — bypasses the
   * practitioner/resource overlap check instead of silently allowing it by default. */
  override: z.boolean().optional(),
  /** `telehealth` mints a video visit (join links) via the configured `VideoVisitGateway`. */
  visitType: z.enum(['in_person', 'telehealth']).optional(),
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;

const RecurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly']),
  /** Total number of occurrences to create, including the first. */
  count: z.number().int().min(2).max(52),
  /** If given, stop generating occurrences past this date even if `count` hasn't been reached. */
  until: z.coerce.date().optional(),
});
export type RecurrenceInput = z.infer<typeof RecurrenceSchema>;

export const CreateAppointmentSeriesSchema = CreateAppointmentSchema.extend({
  recurrence: RecurrenceSchema,
});
export type CreateAppointmentSeriesInput = z.infer<typeof CreateAppointmentSeriesSchema>;

export const RescheduleAppointmentSchema = z.object({
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
});
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentSchema>;

export const CancelAppointmentSchema = z.object({
  reason: z.string().min(1).max(500).nullish(),
});
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentSchema>;

/** `scheduledFrom`/`scheduledTo` make "today's schedule" a real, bounded query instead of every appointment ever booked in the tenant. */
export const ListAppointmentsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  practitionerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  scheduledFrom: z.string().datetime().optional(),
  scheduledTo: z.string().datetime().optional(),
});
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>;
