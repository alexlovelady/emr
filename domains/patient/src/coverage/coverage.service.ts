import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '../patient/patient.repository.js';
import type { CreateCoverageInput } from './coverage.dto.js';
import { CoverageRepository, type CoverageRow } from './coverage.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class CoverageService {
  constructor(
    private readonly repo: CoverageRepository = new CoverageRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateCoverageInput): Promise<CoverageRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? null;
    const coverage = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      payerName: input.payerName,
      memberId: input.memberId,
      groupNumber: input.groupNumber ?? null,
      planName: input.planName ?? null,
      coverageType: input.coverageType,
      effectiveStart: input.effectiveStart,
      effectiveEnd: input.effectiveEnd ?? null,
      subscriberRelationship: input.subscriberRelationship,
      subscriberName: input.subscriberName ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'coverage.added.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient',
          aggregate_id: patientId,
          aggregate_version: patient.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { coverageId: coverage.id, payerName: coverage.payerName },
        }),
      )
      .execute();

    return coverage;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<CoverageRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }
}
