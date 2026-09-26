import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import type { RecordReconciliationInput } from './reconciliation.dto.js';
import { MedicationReconciliationRepository, type MedicationReconciliationEventRow } from './reconciliation.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class MedicationReconciliationService {
  constructor(
    private readonly repo: MedicationReconciliationRepository = new MedicationReconciliationRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async record(trx: Executor, ctx: RequestContext, patientId: string, input: RecordReconciliationInput): Promise<MedicationReconciliationEventRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? null;
    const event = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      encounterId: input.encounterId,
      performedBy: actorId ?? ctx.tenantId,
      notes: input.notes ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'medication.reconciled.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient',
          aggregate_id: patientId,
          aggregate_version: patient.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { encounterId: input.encounterId },
        }),
      )
      .execute();

    return event;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<MedicationReconciliationEventRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }
}
