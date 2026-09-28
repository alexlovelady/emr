import type { Kysely, Transaction } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { parseBai2 } from '@ehr/bai2';
import { BankDepositRepository, type BankDepositRow } from './bank-deposit.repository.js';
import { RemittanceRepository } from '../remittance/remittance.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/** A deposit only auto-matches a remittance dated within this many days of the bank's transaction
 * date — payer EFTs typically settle a few business days after the 835 remittance is posted. An
 * explicitly chosen, adjustable heuristic, not a claim that every real deposit lands in this
 * window. */
const AUTO_MATCH_WINDOW_DAYS = 7;

/** BAI2 dates are `YYMMDD` with no century digit — treated as 20YY, appropriate for a system with no
 * data before 2000. */
function bai2DateToIso(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) throw new ConflictError(`Invalid BAI2 date '${yymmdd}' — expected YYMMDD`, { yymmdd });
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

export interface ImportResult {
  importBatchId: string;
  imported: number;
  skipped: number;
  warnings: string[];
}

export interface AutoMatchResult {
  matched: number;
  ambiguous: number;
  remaining: number;
}

/**
 * Athelas RCM parity item 5: file-based bank reconciliation (no live bank-feed API — see migration
 * 0043's doc comment). Deposits are ingested from a staff-uploaded BAI2 export, then matched against
 * `remittances` by amount + a settlement-date window — an exact single match auto-links; anything
 * ambiguous or unmatched stays for a human to resolve via `matchManually`/`ignore`.
 */
export class BankReconciliationService {
  constructor(
    private readonly repo: BankDepositRepository = new BankDepositRepository(),
    private readonly remittanceRepo: RemittanceRepository = new RemittanceRepository(),
  ) {}

  async importStatement(trx: Executor, ctx: RequestContext, rawText: string): Promise<ImportResult> {
    const { file, warnings } = parseBai2(rawText);
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const importBatchId = randomUUID();

    const deposits = file.groups.flatMap((group) =>
      group.accounts.flatMap((account) =>
        account.transactions.map((txn) => ({
          accountNumber: account.accountNumber,
          bankReferenceNumber: txn.bankReferenceNumber,
          transactionDate: bai2DateToIso(group.asOfDate),
          amountCents: txn.amountCents,
          typeCode: txn.typeCode,
          description: txn.text,
        })),
      ),
    );

    const { inserted, skipped } = await this.repo.bulkInsert(trx, { tenantId: ctx.tenantId, importBatchId, deposits, createdBy: actorId });

    return { importBatchId, imported: inserted.length, skipped, warnings };
  }

  async autoMatch(trx: Executor, ctx: RequestContext): Promise<AutoMatchResult> {
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const unmatched = await this.repo.listUnmatched(trx, ctx.tenantId);

    let matched = 0;
    let ambiguous = 0;

    for (const deposit of unmatched) {
      const candidates = await this.remittanceRepo.findUnmatchedByAmountAndDateWindow(
        trx,
        ctx.tenantId,
        deposit.amount,
        deposit.transactionDate,
        AUTO_MATCH_WINDOW_DAYS,
      );
      if (candidates.length === 1) {
        await this.repo.markMatched(trx, ctx.tenantId, deposit.id, candidates[0]!.id, actorId);
        matched++;
      } else if (candidates.length > 1) {
        ambiguous++;
      }
    }

    return { matched, ambiguous, remaining: unmatched.length - matched };
  }

  async matchManually(trx: Executor, ctx: RequestContext, depositId: string, remittanceId: string): Promise<BankDepositRow> {
    const deposit = await this.repo.findById(trx, ctx.tenantId, depositId);
    if (!deposit) throw new NotFoundError('Bank deposit not found', { depositId });
    if (deposit.status !== 'unmatched') {
      throw new ConflictError(`Deposit is already ${deposit.status}`, { depositId, status: deposit.status });
    }
    const remittance = await this.remittanceRepo.findById(trx, ctx.tenantId, remittanceId);
    if (!remittance) throw new NotFoundError('Remittance not found', { remittanceId });

    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.markMatched(trx, ctx.tenantId, depositId, remittanceId, actorId);
  }

  async ignore(trx: Executor, ctx: RequestContext, depositId: string, reason: string): Promise<BankDepositRow> {
    const deposit = await this.repo.findById(trx, ctx.tenantId, depositId);
    if (!deposit) throw new NotFoundError('Bank deposit not found', { depositId });
    if (deposit.status !== 'unmatched') {
      throw new ConflictError(`Deposit is already ${deposit.status}`, { depositId, status: deposit.status });
    }
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.markIgnored(trx, ctx.tenantId, depositId, reason, actorId);
  }

  async listUnmatched(trx: Executor, ctx: RequestContext): Promise<BankDepositRow[]> {
    return this.repo.listUnmatched(trx, ctx.tenantId);
  }
}
