import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB, IntakeFormField } from '@ehr/db';

export interface IntakeFormTemplateRow {
  id: string;
  tenantId: string;
  name: string;
  schemaVersion: number;
  schema: IntakeFormField[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class IntakeFormTemplateRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; name: string; schema: IntakeFormField[]; createdBy: string },
  ): Promise<IntakeFormTemplateRow> {
    const row = await trx
      .insertInto('intake_form_templates')
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        schema: JSON.stringify(input.schema),
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<IntakeFormTemplateRow | null> {
    const row = await trx
      .selectFrom('intake_form_templates')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<IntakeFormTemplateRow[]> {
    const rows = await trx
      .selectFrom('intake_form_templates')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['intake_form_templates']>): IntakeFormTemplateRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    schemaVersion: dbRow.schema_version,
    schema: dbRow.schema,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
