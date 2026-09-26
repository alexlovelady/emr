import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { AppointmentService } from '@ehr/scheduling';
import { TaskService } from '@ehr/tasks';
import { PatientRepository, type PatientRow } from '../patient/patient.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface TimelineEntry {
  type: 'appointment' | 'task';
  occurredAt: Date;
  summary: string;
  resourceId: string;
  status: string;
}

export interface PatientTimeline {
  patient: PatientRow;
  entries: TimelineEntry[];
}

/**
 * Read-only aggregation shell (spec's Phase 2 "patient timeline shell") over the only two
 * sources that exist yet — appointments and tasks. No pagination: acceptable for Phase 2's data
 * volumes, revisit once clinical timeline entries arrive in later phases.
 */
export class PatientTimelineService {
  constructor(
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly appointmentService: AppointmentService = new AppointmentService(),
    private readonly taskService: TaskService = new TaskService(),
  ) {}

  async getTimeline(trx: Executor, ctx: RequestContext, patientId: string): Promise<PatientTimeline> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { id: patientId });

    const [appointments, tasks] = await Promise.all([
      this.appointmentService.list(trx, ctx, { patientId }),
      this.taskService.list(trx, ctx, { patientId }),
    ]);

    const entries: TimelineEntry[] = [
      ...appointments.map(
        (appointment): TimelineEntry => ({
          type: 'appointment',
          occurredAt: appointment.scheduledStart,
          summary: `${appointment.appointmentType} appointment`,
          resourceId: appointment.id,
          status: appointment.status,
        }),
      ),
      ...tasks.map(
        (task): TimelineEntry => ({
          type: 'task',
          occurredAt: task.createdAt,
          summary: task.title,
          resourceId: task.id,
          status: task.status,
        }),
      ),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return { patient, entries };
  }
}
