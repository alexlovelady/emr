import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB, NoteTemplateSection } from '@ehr/db';

export interface NoteTemplateRow {
  id: string;
  tenantId: string;
  name: string;
  schemaVersion: number;
  sections: NoteTemplateSection[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class NoteTemplateRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; name: string; sections: NoteTemplateSection[]; createdBy: string },
  ): Promise<NoteTemplateRow> {
    const row = await trx
      .insertInto('note_templates')
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        sections: JSON.stringify(input.sections),
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<NoteTemplateRow | null> {
    const row = await trx
      .selectFrom('note_templates')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<NoteTemplateRow[]> {
    const rows = await trx
      .selectFrom('note_templates')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['note_templates']>): NoteTemplateRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    schemaVersion: dbRow.schema_version,
    sections: dbRow.sections,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}
