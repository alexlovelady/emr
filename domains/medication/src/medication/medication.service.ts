import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import { TerminologyService, RXNORM_SYSTEM, type CodeValidation } from '@ehr/terminology';
import { validateDose, type DoseValidationResult } from '@ehr/dose-utils';
import type { CreateMedicationInput } from './medication.dto.js';
import { MedicationRepository, type MedicationRow } from './medication.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TERMINAL_STATUSES = ['discontinued', 'completed', 'entered_in_error'];

export class MedicationService {
  constructor(
    private readonly repo: MedicationRepository = new MedicationRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly terminology: TerminologyService = new TerminologyService(),
  ) {}

  /**
   * Phase M: `codeValidation` is null when no `rxnormCode` was given at all (patient-reported/
   * external-import medications often have none) — distinct from `{valid: false, checked: ...}`,
   * which means a code WAS given and didn't match. "Warn, don't hard-block" per the plan: an
   * unrecognized code never blocks recording the medication.
   *
   * `doseValidation` is similarly null when no `dose` was given, and non-null with an empty
   * `warnings` array for an ordinary, plausible dose — see item 19 / `packages/dose-utils`. The DTO
   * layer (`CreateMedicationSchema`) already hard-blocks an unparseable dose before this method
   * ever runs; what's returned here is only ever the non-blocking `warnings` half.
   */
  async create(
    trx: Executor,
    ctx: RequestContext,
    patientId: string,
    input: CreateMedicationInput,
  ): Promise<{ medication: MedicationRow; codeValidation: CodeValidation | null; doseValidation: DoseValidationResult | null }> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const codeValidation = input.rxnormCode ? await this.terminology.validateCode(trx, RXNORM_SYSTEM, input.rxnormCode) : null;
    const doseValidation = input.dose ? validateDose(input.dose) : null;

    const actorId = ctx.actor?.id ?? null;
    const medication = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      encounterId: input.encounterId ?? null,
      medicationName: input.medicationName,
      rxnormCode: input.rxnormCode ?? null,
      dose: input.dose ?? null,
      route: input.route ?? null,
      frequency: input.frequency ?? null,
      sourceType: input.sourceType,
      startedAt: input.startedAt ?? null,
      prescriberId: input.prescriberId ?? null,
      notes: input.notes ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'medication.recorded.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'medication',
          aggregate_id: medication.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { medicationName: medication.medicationName, sourceType: medication.sourceType },
        }),
      )
      .execute();

    return { medication, codeValidation, doseValidation };
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<MedicationRow> {
    const medication = await this.repo.findById(trx, ctx.tenantId, id);
    if (!medication) throw new NotFoundError('Medication not found', { id });
    return medication;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<MedicationRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async discontinue(trx: Executor, ctx: RequestContext, id: string, stoppedAt: string | null): Promise<MedicationRow> {
    const current = await this.getById(trx, ctx, id);
    if (TERMINAL_STATUSES.includes(current.status)) {
      throw new ConflictError(`Medication is already ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.setStatus(
      trx,
      ctx.tenantId,
      id,
      'discontinued',
      stoppedAt ?? new Date().toISOString().slice(0, 10),
      actorId ?? ctx.tenantId,
    );

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'medication.discontinued.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'medication',
          aggregate_id: updated.id,
          aggregate_version: updated.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: {},
        }),
      )
      .execute();

    return updated;
  }
}
