import { z } from 'zod';

/** No `resourceIds`/`override` — those are staff-only concepts (rooms/equipment assignment, the
 * explicit double-booking escape hatch). A patient can only request a plain practitioner+location
 * slot and finds out immediately, via the same conflict check staff booking uses, whether it's
 * actually open — see AppointmentService.create()'s doc comment. No availability/working-hours
 * model exists anywhere in this codebase yet, so there is no "pick from open slots" UI to build
 * honestly; this is the same reactive-conflict-check UX every other booking path here already has. */
export const PortalBookAppointmentSchema = z.object({
  locationId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  appointmentType: z.string().min(1).max(200),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
});
export type PortalBookAppointmentInput = z.infer<typeof PortalBookAppointmentSchema>;

export const PortalCancelAppointmentSchema = z.object({
  reason: z.string().min(1).max(500).nullish(),
});
export type PortalCancelAppointmentInput = z.infer<typeof PortalCancelAppointmentSchema>;
