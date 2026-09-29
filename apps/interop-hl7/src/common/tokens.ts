/** NestJS DI injection tokens for apps/interop-hl7's non-class providers. */
export const DB_CONNECTION = Symbol('DB_CONNECTION');
/** Owner/bootstrap-role connection — only for `Hl7RetryRelay`'s cross-tenant due-retries poll (see
 * that class's own doc comment for why it can't use the RLS-scoped `DB_CONNECTION`). */
export const OWNER_DB_CONNECTION = Symbol('OWNER_DB_CONNECTION');
export const KEY_RING = Symbol('KEY_RING');
export const ENV_CONFIG = Symbol('ENV_CONFIG');
