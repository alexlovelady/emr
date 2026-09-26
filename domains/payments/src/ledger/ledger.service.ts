import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository } from '@ehr/patient';
import { LedgerRepository, type LedgerEntryRow } from './ledger.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface PatientLedger {
  entries: LedgerEntryRow[];
  balance: string;
}

/**
 * A simple, real, append-only ledger — no separate balance-cache column to keep in sync. Charges
 * post a positive (owed) entry, payments/adjustments post negative entries; the running balance
 * is computed here, not denormalized.
 */
export class LedgerService {
  constructor(
    private readonly repo: LedgerRepository = new LedgerRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async postEntry(
    trx: Executor,
    ctx: RequestContext,
    input: { patientId: string; claimId: string | null; entryType: string; amount: string; description: string },
  ): Promise<LedgerEntryRow> {
    const actorId = ctx.actor?.id ?? null;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: input.patientId,
      claimId: input.claimId,
      entryType: input.entryType,
      amount: input.amount,
      description: input.description,
      createdBy: actorId ?? ctx.tenantId,
    });
  }

  async getLedger(trx: Executor, ctx: RequestContext, patientId: string): Promise<PatientLedger> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const entries = await this.repo.listByPatient(trx, ctx.tenantId, patientId);
    const balance = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    return { entries, balance: balance.toFixed(2) };
  }
}
