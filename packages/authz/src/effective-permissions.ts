import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

/**
 * The full set of permission keys an active (non-revoked) role assignment grants this user in
 * this tenant — the same `user_roles`/`role_permissions` join `rolePermissionLayer` uses, minus
 * its single-`permission_key` filter. Always a fresh read, never cached or embedded in a token
 * (see `RequestContext`'s doc comment on why the JWT itself carries no role/permission claims) —
 * a revoked role is reflected here immediately, not only after the caller's token expires.
 */
export async function getEffectivePermissions(
  db: Kysely<DB> | Transaction<DB>,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('user_roles')
    .innerJoin('role_permissions', 'role_permissions.role_id', 'user_roles.role_id')
    .select('role_permissions.permission_key')
    .distinct()
    .where('user_roles.tenant_id', '=', tenantId)
    .where('user_roles.user_id', '=', userId)
    .where('user_roles.revoked_at', 'is', null)
    .execute();

  return rows.map((r) => r.permission_key);
}
