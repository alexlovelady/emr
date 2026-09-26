import { promises as fs } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getConfig } from '@ehr/config';
import { createDb } from '@ehr/db';
import { loadOrCreateKeyMaterial } from '@ehr/auth-adapter';
import { DB_CONNECTION, OWNER_DB_CONNECTION, KEY_MATERIAL, ENV_CONFIG } from '../common/tokens.js';

const env = getConfig();
const db = createDb({ connectionString: env.APP_DATABASE_URL });
/**
 * Only for `TokenService`'s client_id lookup — a client presents credentials before we know
 * which tenant it belongs to, the same bootstrapping problem `OutboxRelay` has for background
 * work across every tenant. Never used for anything FHIR-resource-facing (those always go
 * through `DB_CONNECTION`, the RLS-enforcing `ehr_app` role).
 */
const ownerDb = createDb({ connectionString: env.DATABASE_URL });

@Global()
@Module({
  providers: [
    { provide: ENV_CONFIG, useValue: env },
    { provide: DB_CONNECTION, useValue: db },
    { provide: OWNER_DB_CONNECTION, useValue: ownerDb },
    {
      provide: KEY_MATERIAL,
      useFactory: async () => {
        await fs.mkdir('.dev', { recursive: true }).catch(() => undefined);
        return loadOrCreateKeyMaterial(env.JWT_PRIVATE_KEY_PATH, env.JWT_PUBLIC_KEY_PATH);
      },
    },
    Reflector,
  ],
  exports: [ENV_CONFIG, DB_CONNECTION, OWNER_DB_CONNECTION, KEY_MATERIAL, Reflector],
})
export class CoreModule {}
