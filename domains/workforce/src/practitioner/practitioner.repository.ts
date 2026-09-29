import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PractitionerRow {
  id: string;
  tenantId: string;
  workforceIdentityId: string;
  organizationId: string;
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

    return toRow(row, input.organizationId);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PractitionerRow | null> {
    const row = await trx
      .selectFrom('practitioners')
      .innerJoin('workforce_identities', 'workforce_identities.id', 'practitioners.workforce_identity_id')
      .selectAll('practitioners')
      .select('workforce_identities.organization_id as organization_id')
      .where('practitioners.tenant_id', '=', tenantId)
      .where('practitioners.id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row, row.organization_id) : null;
  }

  async list(trx: Executor, tenantId: string, pagination: { limit?: number | undefined; offset?: number | undefined } = {}): Promise<PractitionerRow[]> {
    let query = trx
      .selectFrom('practitioners')
      .innerJoin('workforce_identities', 'workforce_identities.id', 'practitioners.workforce_identity_id')
      .selectAll('practitioners')
      .select('workforce_identities.organization_id as organization_id')
      .where('practitioners.tenant_id', '=', tenantId)
      .orderBy('practitioners.created_at', 'asc');
    if (pagination.limit !== undefined) query = query.limit(pagination.limit);
    if (pagination.offset !== undefined) query = query.offset(pagination.offset);
    const rows = await query.execute();
    return rows.map((row) => toRow(row, row.organization_id));
  }

  async update(
    trx: Executor,
    tenantId: string,
    id: string,
    input: {
      displayName?: string | undefined;
      npi?: string | null | undefined;
      taxonomyCode?: string | null | undefined;
      updatedBy: string;
    },
  ): Promise<PractitionerRow> {
    const row = await trx
      .updateTable('practitioners')
      .set({
        ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
        ...(input.npi !== undefined ? { npi: input.npi } : {}),
        ...(input.taxonomyCode !== undefined ? { taxonomy_code: input.taxonomyCode } : {}),
        updated_by: input.updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const withOrg = await this.findById(trx, tenantId, row.id);
    return withOrg!;
  }

  async setStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<PractitionerRow> {
    await trx
      .updateTable('practitioners')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .execute();
    const withOrg = await this.findById(trx, tenantId, id);
    return withOrg!;
  }
}

function toRow(dbRow: Selectable<DB['practitioners']>, organizationId: string): PractitionerRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    workforceIdentityId: dbRow.workforce_identity_id,
    organizationId,
    displayName: dbRow.display_name,
    npi: dbRow.npi,
    taxonomyCode: dbRow.taxonomy_code,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
