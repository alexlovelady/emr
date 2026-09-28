import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AiContextItem } from '@ehr/ai-adapter';
import { EncounterRepository, ObservationRepository, ProcedureRepository, ProblemRepository } from '@ehr/clinical';

type Executor = Kysely<DB> | Transaction<DB>;

const encounterRepo = new EncounterRepository();
const observationRepo = new ObservationRepository();
const procedureRepo = new ProcedureRepository();
const problemRepo = new ProblemRepository();

/**
 * Shared by both coding-suggestion entry points (the original per-encounter report, and the
 * charge-scoped one wired into charge capture) so the two don't drift on what context an AI coding
 * suggestion actually sees.
 */
export async function buildCodingContext(trx: Executor, tenantId: string, encounterId: string): Promise<AiContextItem[]> {
  const encounter = await encounterRepo.findById(trx, tenantId, encounterId);
  if (!encounter) return [];

  const [problems, procedures, observations] = await Promise.all([
    problemRepo.listActiveByPatient(trx, tenantId, encounter.patientId),
    procedureRepo.listByEncounter(trx, tenantId, encounterId),
    observationRepo.listByEncounter(trx, tenantId, encounterId),
  ]);

  return [
    ...problems.map((p) => ({ ref: `Problem/${p.id}`, data: { displayName: p.displayName, code: p.code, codeSystem: p.codeSystem } })),
    ...procedures.map((p) => ({ ref: `Procedure/${p.id}`, data: { code: p.code, displayName: p.displayName } })),
    ...observations.map((o) => ({ ref: `Observation/${o.id}`, data: { code: o.code, displayName: o.displayName } })),
  ];
}
