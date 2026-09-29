import { promises as fs } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getConfig } from '@ehr/config';
import { createDb } from '@ehr/db';
import { createKeyRingStore } from '@ehr/auth-adapter';
import { S3ObjectStorageGateway } from '@ehr/object-storage';
import { DB_CONNECTION, OWNER_DB_CONNECTION, KEY_RING, ENV_CONFIG, OBJECT_STORAGE_GATEWAY } from '../common/tokens.js';

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
      // Same shared-file keyring as apps/api (see that app's core.module.ts doc comment) — this
      // process only ever SIGNS/verifies SMART tokens with it (interop-fhir never performs a
      // rotation itself; that's an apps/api admin action), so it just needs to stay current via the
      // periodic reload poll below.
      provide: KEY_RING,
      useFactory: async () => {
        await fs.mkdir('.dev', { recursive: true }).catch(() => undefined);
        const store = await createKeyRingStore(env.JWT_KEYRING_PATH, env.JWT_PRIVATE_KEY_PATH, env.JWT_PUBLIC_KEY_PATH);
        store.startAutoReload(env.KEY_RING_RELOAD_INTERVAL_MS);
        return store;
      },
    },
    {
      provide: OBJECT_STORAGE_GATEWAY,
      useFactory: () =>
        new S3ObjectStorageGateway({
          endpoint: env.OBJECT_STORAGE_ENDPOINT,
          bucket: env.OBJECT_STORAGE_BUCKET,
          region: env.OBJECT_STORAGE_REGION,
          accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
          forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
          presignTtlSeconds: env.OBJECT_STORAGE_PRESIGN_TTL_SECONDS,
        }),
    },
    Reflector,
  ],
  exports: [ENV_CONFIG, DB_CONNECTION, OWNER_DB_CONNECTION, KEY_RING, OBJECT_STORAGE_GATEWAY, Reflector],
})
export class CoreModule {}
