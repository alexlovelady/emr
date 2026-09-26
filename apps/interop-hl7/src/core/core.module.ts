import { promises as fs } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getConfig } from '@ehr/config';
import { createDb } from '@ehr/db';
import { PolicyEngine } from '@ehr/authz';
import { loadOrCreateKeyMaterial } from '@ehr/auth-adapter';
import { DB_CONNECTION, KEY_MATERIAL, ENV_CONFIG } from '../common/tokens.js';

const env = getConfig();
const db = createDb({ connectionString: env.APP_DATABASE_URL });

@Global()
@Module({
  providers: [
    { provide: ENV_CONFIG, useValue: env },
    { provide: DB_CONNECTION, useValue: db },
    {
      provide: KEY_MATERIAL,
      useFactory: async () => {
        await fs.mkdir('.dev', { recursive: true }).catch(() => undefined);
        return loadOrCreateKeyMaterial(env.JWT_PRIVATE_KEY_PATH, env.JWT_PUBLIC_KEY_PATH);
      },
    },
    { provide: PolicyEngine, useValue: new PolicyEngine() },
    Reflector,
  ],
  exports: [ENV_CONFIG, DB_CONNECTION, KEY_MATERIAL, PolicyEngine, Reflector],
})
export class CoreModule {}
