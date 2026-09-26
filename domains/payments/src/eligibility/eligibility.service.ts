import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository, CoverageRepository } from '@ehr/patient';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import type { CreateEligibilityCheckInput } from './eligibility.dto.js';
import { EligibilityRepository, type EligibilityCheckRow } from './eligibility.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class EligibilityService {
  constructor(
    private readonly gateway: ClearinghouseGateway,
    private readonly repo: EligibilityRepository = new EligibilityRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly coverageRepo: CoverageRepository = new CoverageRepository(),
  ) {}

  async check(trx: Executor, ctx: RequestContext, patientId: string, input: CreateEligibilityCheckInput): Promise<EligibilityCheckRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const coverage = await this.coverageRepo.findById(trx, ctx.tenantId, input.coverageId);
    if (!coverage) throw new NotFoundError('Coverage not found', { coverageId: input.coverageId });
    if (coverage.patientId !== patientId) {
      throw new ConflictError('The coverage does not belong to this patient', { patientId, coverageId: input.coverageId });
    }

    const result = await this.gateway.checkEligibility({
      payerName: coverage.payerName,
      memberId: coverage.memberId,
      patientName: `${patient.givenName} ${patient.familyName}`,
    });

    const actorId = ctx.actor?.id ?? null;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      coverageId: input.coverageId,
      isEligible: result.isEligible,
      copayAmount: result.copayAmount != null ? String(result.copayAmount) : null,
      deductibleRemaining: result.deductibleRemaining != null ? String(result.deductibleRemaining) : null,
      rawResponse: { ...result },
      createdBy: actorId ?? ctx.tenantId,
    });
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<EligibilityCheckRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }
}
