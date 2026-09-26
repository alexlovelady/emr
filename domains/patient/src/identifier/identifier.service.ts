import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '../patient/patient.repository.js';
import type { CreatePatientIdentifierInput } from './identifier.dto.js';
import { PatientIdentifierRepository, type PatientIdentifierRow } from './identifier.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class PatientIdentifierService {
  constructor(
    private readonly repo: PatientIdentifierRepository = new PatientIdentifierRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreatePatientIdentifierInput): Promise<PatientIdentifierRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? null;
    let identifier: PatientIdentifierRow;
    try {
      identifier = await this.repo.create(trx, {
        tenantId: ctx.tenantId,
        patientId,
        organizationId: input.organizationId ?? null,
        identifierSystem: input.identifierSystem,
        value: input.value,
        isPrimary: input.isPrimary,
        createdBy: actorId ?? ctx.tenantId,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('This identifier is already in use for this issuer', {
          identifierSystem: input.identifierSystem,
          value: input.value,
        });
      }
      throw err;
    }

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'patient.identifier.added.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient',
          aggregate_id: patientId,
          aggregate_version: patient.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { identifierSystem: identifier.identifierSystem, identifierId: identifier.id },
        }),
      )
      .execute();

    return identifier;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<PatientIdentifierRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }
}

/** Postgres unique_violation (23505) — see https://www.postgresql.org/docs/current/errcodes-appendix.html */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}
