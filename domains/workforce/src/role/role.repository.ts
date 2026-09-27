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

/** A user's active role grant, joined with the role's own key/displayName for display — what
 * `GET /users/:id/roles` returns (no such listing endpoint existed before this pass). */
export interface UserRoleGrant extends UserRoleRow {
  roleKey: string;
  roleDisplayName: string;
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

  async findById(trx: Executor, id: string): Promise<RoleRow | null> {
    const row = await trx.selectFrom('roles').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toRoleRow(row) : null;
  }

  async createRole(trx: Executor, input: { key: string; displayName: string }): Promise<RoleRow> {
    const row = await trx
      .insertInto('roles')
      .values({ key: input.key, display_name: input.displayName, is_system: false })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRoleRow(row);
  }

  async listPermissions(trx: Executor, roleId: string): Promise<string[]> {
    const rows = await trx.selectFrom('role_permissions').select('permission_key').where('role_id', '=', roleId).execute();
    return rows.map((r) => r.permission_key);
  }

  async grantPermission(trx: Executor, roleId: string, permissionKey: string): Promise<void> {
    await trx
      .insertInto('role_permissions')
      .values({ role_id: roleId, permission_key: permissionKey })
      .onConflict((oc) => oc.columns(['role_id', 'permission_key']).doNothing())
      .execute();
  }

  async revokePermission(trx: Executor, roleId: string, permissionKey: string): Promise<void> {
    await trx
      .deleteFrom('role_permissions')
      .where('role_id', '=', roleId)
      .where('permission_key', '=', permissionKey)
      .execute();
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

  async listActiveGrantsForUser(trx: Executor, tenantId: string, userId: string): Promise<UserRoleGrant[]> {
    const rows = await trx
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .selectAll('user_roles')
      .select(['roles.key as role_key', 'roles.display_name as role_display_name'])
      .where('user_roles.tenant_id', '=', tenantId)
      .where('user_roles.user_id', '=', userId)
      .where('user_roles.revoked_at', 'is', null)
      .orderBy('user_roles.granted_at', 'asc')
      .execute();
    return rows.map((row) => ({ ...toUserRoleRow(row), roleKey: row.role_key, roleDisplayName: row.role_display_name }));
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
