/** NestJS DI injection tokens for apps/api's non-class providers. */
export const DB_CONNECTION = Symbol('DB_CONNECTION');
/** Holds a mutable `{ current: KeyRing }` box, not a `KeyRing` directly — see core.module.ts's
 * `KEY_RING` provider doc comment for why a plain injected value can't reflect a later rotation or
 * reload. */
export const KEY_RING = Symbol('KEY_RING');
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
/** Item 23 — resolves a federated login's local user without ever touching a password; see
 * `FederatedIdentityProvider`'s own doc comment for why it's a sibling of `IDENTITY_PROVIDER`
 * rather than a second `IdentityProvider` implementation. */
export const FEDERATED_IDENTITY_PROVIDER = Symbol('FEDERATED_IDENTITY_PROVIDER');
export const ENV_CONFIG = Symbol('ENV_CONFIG');
