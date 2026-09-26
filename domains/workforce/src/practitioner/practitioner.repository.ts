import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PractitionerRow {
  id: string;
  tenantId: string;
  workforceIdentityId: string;
  displayName: string;
  npi: string | null;
  taxonomyCode: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class PractitionerRepository {
  /** Creates the WorkforceIdentity ─ Practitioner pair together (see PractitionerService). */
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      userId: string;
      organizationId: string;
      displayName: string;
      npi: string | null;
      taxonomyCode: string | null;
      createdBy: string;
    },
  ): Promise<PractitionerRow> {
    const workforceIdentity = await trx
      .insertInto('workforce_identities')
      .values({
        tenant_id: input.tenantId,
        user_id: input.userId,
        organization_id: input.organizationId,
        employment_status: 'active',
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const row = await trx
      .insertInto('practitioners')
      .values({
        tenant_id: input.tenantId,
        workforce_identity_id: workforceIdentity.id,
        display_name: input.displayName,
        npi: input.npi,
        taxonomy_code: input.taxonomyCode,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PractitionerRow | null> {
    const row = await trx
      .selectFrom('practitioners')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<PractitionerRow[]> {
    const rows = await trx
      .selectFrom('practitioners')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['practitioners']>): PractitionerRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    workforceIdentityId: dbRow.workforce_identity_id,
    displayName: dbRow.display_name,
    npi: dbRow.npi,
    taxonomyCode: dbRow.taxonomy_code,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
