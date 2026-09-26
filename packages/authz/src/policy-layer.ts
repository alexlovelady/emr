import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AuthzContext } from './context.js';

export type LayerResult = 'ALLOW' | 'DENY' | 'NOT_APPLICABLE';

/**
 * One layer of EHR_BUILD_SPEC.md §6.2's 8-layer authorization model. Layers are evaluated in a
 * FIXED order (see policy-engine.ts's DEFAULT_LAYERS) — this is not a configurable rule engine,
 * it is the specific, spec-mandated sequence: tenant membership -> user status -> role permission
 * -> resource relationship -> purpose/sensitivity -> consent/proxy -> state/special-law ->
 * break-glass.
 */
export interface PolicyLayer {
  readonly name: string;
  evaluate(ctx: AuthzContext, db: Kysely<DB> | Transaction<DB>): Promise<LayerResult>;
}
