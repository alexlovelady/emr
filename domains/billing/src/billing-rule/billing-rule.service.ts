import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository } from '@ehr/patient';
import { BillingRuleRepository, type BillingRuleRow } from './billing-rule.repository.js';
import type { CreateBillingRuleInput } from './billing-rule.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface EvaluateChargeInput {
  patientId: string;
  code: string;
  units: number;
  diagnosisCodes: string[];
}

/**
 * Configurable billing rules (Athelas RCM parity item 7) — see migration 0044's doc comment on why
 * this is a fixed rule-type catalog rather than a general expression language. `evaluateCharge` is
 * called from `ChargeService.finalizeCoding()`, the same "check once the code is actually locked
 * in" point `domains/claims/src/claim/scrub-claim.ts` uses for claim-level scrubbing — a draft
 * charge's provisional code is never rule-checked, only the one about to become billable.
 */
export class BillingRuleService {
  constructor(
    private readonly repo: BillingRuleRepository = new BillingRuleRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateBillingRuleInput): Promise<BillingRuleRow> {
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      ruleType: input.ruleType,
      description: input.description,
      parameters: input.parameters,
      createdBy: actorId,
    });
  }

  async list(trx: Executor, ctx: RequestContext): Promise<BillingRuleRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }

  async updateStatus(trx: Executor, ctx: RequestContext, id: string, status: 'active' | 'inactive'): Promise<BillingRuleRow> {
    const rule = await this.repo.findById(trx, ctx.tenantId, id);
    if (!rule) throw new NotFoundError('Billing rule not found', { id });
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.updateStatus(trx, ctx.tenantId, id, status, actorId);
  }

  /** Returns a list of human-readable violation messages — empty means no active rule was broken.
   * Never throws itself; the caller (ChargeService.finalizeCoding) decides what a non-empty result
   * means. */
  async evaluateCharge(trx: Executor, tenantId: string, input: EvaluateChargeInput): Promise<string[]> {
    const rules = await this.repo.listActive(trx, tenantId);
    const applicable = rules.filter((r) => (r.parameters as { code?: string }).code === input.code);
    if (applicable.length === 0) return [];

    const violations: string[] = [];
    let patientSexAtBirth: string | null | undefined;

    for (const rule of applicable) {
      if (rule.ruleType === 'code_requires_diagnosis_prefix') {
        const params = rule.parameters as { code: string; diagnosisPrefix: string };
        const satisfied = input.diagnosisCodes.some((d) => d.startsWith(params.diagnosisPrefix));
        if (!satisfied) {
          violations.push(`${rule.description}: code ${params.code} requires a diagnosis code starting with '${params.diagnosisPrefix}'`);
        }
      } else if (rule.ruleType === 'code_forbidden_for_sex') {
        const params = rule.parameters as { code: string; sex: 'M' | 'F' };
        if (patientSexAtBirth === undefined) {
          const patient = await this.patientRepo.findById(trx, tenantId, input.patientId);
          patientSexAtBirth = patient?.sexAtBirth ?? null;
        }
        if (patientSexAtBirth === params.sex) {
          violations.push(`${rule.description}: code ${params.code} is not billable for a patient recorded as sex ${params.sex}`);
        }
      } else if (rule.ruleType === 'code_max_units') {
        const params = rule.parameters as { code: string; maxUnits: number };
        if (input.units > params.maxUnits) {
          violations.push(`${rule.description}: code ${params.code} allows at most ${params.maxUnits} unit(s), got ${input.units}`);
        }
      }
    }

    return violations;
  }
}
