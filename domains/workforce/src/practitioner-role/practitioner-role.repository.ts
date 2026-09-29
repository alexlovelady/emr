import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PractitionerRoleRow {
  id: string;
  tenantId: string;
  practitionerId: string;
  locationId: string;
  roleId: string;
  effectiveStart: Date;
  effectiveEnd: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** The structural link between a practitioner and a specific location — schema existed since
 * migration 0004 but had zero HTTP surface until this pass (confirmed via repo-wide grep). */
export class PractitionerRoleRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      practitionerId: string;
      locationId: string;
      roleId: string;
      effectiveStart?: string;
      effectiveEnd?: string | null;
      createdBy: string;
    },
  ): Promise<PractitionerRoleRow> {
    const row = await trx
      .insertInto('practitioner_roles')
      .values({
        tenant_id: input.tenantId,
        practitioner_id: input.practitionerId,
        location_id: input.locationId,
        role_id: input.roleId,
        ...(input.effectiveStart ? { effective_start: new Date(input.effectiveStart) } : {}),
        effective_end: input.effectiveEnd ? new Date(input.effectiveEnd) : null,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async listByPractitioner(trx: Executor, tenantId: string, practitionerId: string): Promise<PractitionerRoleRow[]> {
    const rows = await trx
      .selectFrom('practitioner_roles')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('practitioner_id', '=', practitionerId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PractitionerRoleRow | null> {
    const row = await trx
      .selectFrom('practitioner_roles')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async revoke(trx: Executor, tenantId: string, id: string, revokedBy: string): Promise<PractitionerRoleRow> {
    const row = await trx
      .updateTable('practitioner_roles')
      .set({ status: 'revoked', effective_end: new Date(), updated_by: revokedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['practitioner_roles']>): PractitionerRoleRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    practitionerId: dbRow.practitioner_id,
    locationId: dbRow.location_id,
    roleId: dbRow.role_id,
    effectiveStart: dbRow.effective_start,
    effectiveEnd: dbRow.effective_end,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
