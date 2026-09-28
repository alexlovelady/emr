import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface BillingRuleRow {
  id: string;
  tenantId: string;
  ruleType: string;
  description: string;
  parameters: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class BillingRuleRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; ruleType: string; description: string; parameters: Record<string, unknown>; createdBy: string },
  ): Promise<BillingRuleRow> {
    const row = await trx
      .insertInto('billing_rules')
      .values({
        tenant_id: input.tenantId,
        rule_type: input.ruleType,
        description: input.description,
        parameters: JSON.stringify(input.parameters),
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<BillingRuleRow | null> {
    const row = await trx.selectFrom('billing_rules').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<BillingRuleRow[]> {
    const rows = await trx.selectFrom('billing_rules').selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'asc').execute();
    return rows.map(toRow);
  }

  async listActive(trx: Executor, tenantId: string): Promise<BillingRuleRow[]> {
    const rows = await trx
      .selectFrom('billing_rules')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'active')
      .execute();
    return rows.map(toRow);
  }

  async updateStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<BillingRuleRow> {
    const row = await trx
      .updateTable('billing_rules')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['billing_rules']>): BillingRuleRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    ruleType: dbRow.rule_type,
    description: dbRow.description,
    parameters: dbRow.parameters,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
