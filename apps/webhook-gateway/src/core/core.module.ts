import { Global, Module } from '@nestjs/common';
import { getConfig } from '@ehr/config';
import { createDb } from '@ehr/db';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { CLEARINGHOUSE_GATEWAY } from '@ehr/claims';
import { DB_CONNECTION, OWNER_DB_CONNECTION, ENV_CONFIG } from '../common/tokens.js';

const env = getConfig();
const db = createDb({ connectionString: env.APP_DATABASE_URL });
/**
 * Only for resolving which tenant an inbound 277CA/835 belongs to (correlating the clearinghouse's
 * own transaction id against `claim_versions` BEFORE we know the tenant) — the same bootstrapping
 * exception `apps/interop-fhir`'s TokenService and `OutboxRelay` already use. Every subsequent
 * domain write happens through `runWithRequestTransaction(db, tenantId, ...)` using the app-role,
 * RLS-enforcing `DB_CONNECTION` instead.
 */
const ownerDb = createDb({ connectionString: env.DATABASE_URL });

@Global()
@Module({
  providers: [
    { provide: ENV_CONFIG, useValue: env },
    { provide: DB_CONNECTION, useValue: db },
    { provide: OWNER_DB_CONNECTION, useValue: ownerDb },
    { provide: CLEARINGHOUSE_GATEWAY, useValue: new NoopClearinghouseGateway() },
  ],
  exports: [ENV_CONFIG, DB_CONNECTION, OWNER_DB_CONNECTION, CLEARINGHOUSE_GATEWAY],
})
export class CoreModule {}
