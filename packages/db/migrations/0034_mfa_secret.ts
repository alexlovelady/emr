import { Kysely } from 'kysely';

/**
 * `mfa_enrolled`/`mfa_method` have existed on `users` since migration 0004 but were write-once,
 * never-read placeholders (no TOTP secret storage existed, so nothing could actually verify a
 * code). Adds the missing secret column — plaintext, no KMS/encryption-at-rest exists in this dev
 * environment (documented gap, same posture as every other dev-only secret in this repo; a real
 * deployment must encrypt this column before going live).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').addColumn('mfa_secret', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('mfa_secret').execute();
}
