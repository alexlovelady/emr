import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface RoleRow {
  id: string;
  key: string;
  displayName: string;
  isSystem: boolean;
  createdAt: Date;
}

export interface UserRoleRow {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  grantedAt: Date;
  grantedBy: string | null;
  revokedAt: Date | null;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** `roles`/`role_permissions` are global system catalogs (no tenant_id) — see migration 0005's own
 * doc comment. `user_roles` is the tenant-scoped grant of a role to a user. */
export class RoleRepository {
  async list(trx: Executor): Promise<RoleRow[]> {
    const rows = await trx.selectFrom('roles').selectAll().orderBy('display_name', 'asc').execute();
    return rows.map(toRoleRow);
  }

  async findByKey(trx: Executor, key: string): Promise<RoleRow | null> {
    const row = await trx.selectFrom('roles').selectAll().where('key', '=', key).executeTakeFirst();
    return row ? toRoleRow(row) : null;
  }

  async findActiveGrant(trx: Executor, tenantId: string, userId: string, roleId: string): Promise<UserRoleRow | null> {
    const row = await trx
      .selectFrom('user_roles')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .where('role_id', '=', roleId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return row ? toUserRoleRow(row) : null;
  }

  async grant(
    trx: Executor,
    input: { tenantId: string; userId: string; roleId: string; grantedBy: string | null; createdBy: string },
  ): Promise<UserRoleRow> {
    const row = await trx
      .insertInto('user_roles')
      .values({
        tenant_id: input.tenantId,
        user_id: input.userId,
        role_id: input.roleId,
        granted_by: input.grantedBy,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toUserRoleRow(row);
  }
}

function toRoleRow(dbRow: Selectable<DB['roles']>): RoleRow {
  return {
    id: dbRow.id,
    key: dbRow.key,
    displayName: dbRow.display_name,
    isSystem: dbRow.is_system,
    createdAt: dbRow.created_at,
  };
}

function toUserRoleRow(dbRow: Selectable<DB['user_roles']>): UserRoleRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    userId: dbRow.user_id,
    roleId: dbRow.role_id,
    grantedAt: dbRow.granted_at,
    grantedBy: dbRow.granted_by,
    revokedAt: dbRow.revoked_at,
  };
}
