import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface BankDepositRow {
  id: string;
  tenantId: string;
  accountNumber: string;
  bankReferenceNumber: string | null;
  transactionDate: string;
  amount: string;
  typeCode: string;
  description: string | null;
  importBatchId: string;
  matchedRemittanceId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface NewBankDeposit {
  accountNumber: string;
  bankReferenceNumber: string | null;
  transactionDate: string;
  amountCents: number;
  typeCode: string;
  description: string | null;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class BankDepositRepository {
  /** Skips a deposit only when it carries a `bankReferenceNumber` that already exists for the same
   * tenant/account/date/amount (see migration 0043's doc comment on why a null reference can't be
   * deduplicated this way). Loops rather than a single bulk statement so each deposit's dedupe check
   * is exact — an acceptable trade for a staff-triggered, one-off file upload, not a hot path. */
  async bulkInsert(
    trx: Executor,
    input: { tenantId: string; importBatchId: string; deposits: NewBankDeposit[]; createdBy: string },
  ): Promise<{ inserted: BankDepositRow[]; skipped: number }> {
    const inserted: BankDepositRow[] = [];
    let skipped = 0;

    for (const deposit of input.deposits) {
      if (deposit.bankReferenceNumber) {
        const existing = await trx
          .selectFrom('bank_deposits')
          .select('id')
          .where('tenant_id', '=', input.tenantId)
          .where('account_number', '=', deposit.accountNumber)
          .where('bank_reference_number', '=', deposit.bankReferenceNumber)
          .where(sql<boolean>`transaction_date = ${deposit.transactionDate}`)
          .where('amount', '=', (deposit.amountCents / 100).toFixed(2))
          .executeTakeFirst();
        if (existing) {
          skipped++;
          continue;
        }
      }

      const row = await trx
        .insertInto('bank_deposits')
        .values({
          tenant_id: input.tenantId,
          account_number: deposit.accountNumber,
          bank_reference_number: deposit.bankReferenceNumber,
          transaction_date: deposit.transactionDate,
          amount: (deposit.amountCents / 100).toFixed(2),
          type_code: deposit.typeCode,
          description: deposit.description,
          import_batch_id: input.importBatchId,
          status: 'unmatched',
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      inserted.push(toRow(row));
    }

    return { inserted, skipped };
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<BankDepositRow | null> {
    const row = await trx.selectFrom('bank_deposits').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listUnmatched(trx: Executor, tenantId: string): Promise<BankDepositRow[]> {
    const rows = await trx
      .selectFrom('bank_deposits')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'unmatched')
      .orderBy('transaction_date', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async markMatched(trx: Executor, tenantId: string, id: string, remittanceId: string, updatedBy: string): Promise<BankDepositRow> {
    const row = await trx
      .updateTable('bank_deposits')
      .set({ status: 'matched', matched_remittance_id: remittanceId, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async markIgnored(trx: Executor, tenantId: string, id: string, reason: string, updatedBy: string): Promise<BankDepositRow> {
    const row = await trx
      .updateTable('bank_deposits')
      .set({ status: 'ignored', description: reason, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['bank_deposits']>): BankDepositRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    accountNumber: dbRow.account_number,
    bankReferenceNumber: dbRow.bank_reference_number,
    transactionDate: formatDate(dbRow.transaction_date),
    amount: dbRow.amount,
    typeCode: dbRow.type_code,
    description: dbRow.description,
    importBatchId: dbRow.import_batch_id,
    matchedRemittanceId: dbRow.matched_remittance_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function formatDate(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}
