import { promises as fs } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getConfig } from '@ehr/config';
import { createDb } from '@ehr/db';
import { PolicyEngine } from '@ehr/authz';
import { createKeyRingStore } from '@ehr/auth-adapter';
import { DB_CONNECTION, OWNER_DB_CONNECTION, KEY_RING, ENV_CONFIG } from '../common/tokens.js';

const env = getConfig();
const db = createDb({ connectionString: env.APP_DATABASE_URL });
/** Only for `Hl7RetryRelay` — see `OWNER_DB_CONNECTION`'s own doc comment in tokens.ts. */
const ownerDb = createDb({ connectionString: env.DATABASE_URL });

@Global()
@Module({
  providers: [
    { provide: ENV_CONFIG, useValue: env },
    { provide: DB_CONNECTION, useValue: db },
    { provide: OWNER_DB_CONNECTION, useValue: ownerDb },
    {
      // Same shared-file keyring as apps/api — see that app's core.module.ts doc comment. This
      // process only verifies staff tokens (for HL7 admin actions), never rotates them itself, so
      // it just needs to stay current via the periodic reload poll.
      provide: KEY_RING,
      useFactory: async () => {
        await fs.mkdir('.dev', { recursive: true }).catch(() => undefined);
        const store = await createKeyRingStore(env.JWT_KEYRING_PATH, env.JWT_PRIVATE_KEY_PATH, env.JWT_PUBLIC_KEY_PATH);
        store.startAutoReload(env.KEY_RING_RELOAD_INTERVAL_MS);
        return store;
      },
    },
    { provide: PolicyEngine, useValue: new PolicyEngine() },
    Reflector,
  ],
  exports: [ENV_CONFIG, DB_CONNECTION, OWNER_DB_CONNECTION, KEY_RING, PolicyEngine, Reflector],
})
export class CoreModule {}
