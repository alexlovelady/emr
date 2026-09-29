import { promises as fs } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getConfig } from '@ehr/config';
import { createDb } from '@ehr/db';
import { PolicyEngine } from '@ehr/authz';
import { createKeyRingStore, FirstPartyIdentityProvider, FederatedIdentityProvider, NoopSsoAssertionVerifier } from '@ehr/auth-adapter';
import { S3ObjectStorageGateway } from '@ehr/object-storage';
import { OBJECT_STORAGE_GATEWAY } from '@ehr/documents';
import { NoopLabOrderGateway } from '@ehr/lab-adapter';
import { LAB_ORDER_GATEWAY } from '@ehr/orders';
import { NoopPrescribingGateway } from '@ehr/erx-adapter';
import { NoopInteractionCheckGateway } from '@ehr/interaction-adapter';
import { ERX_GATEWAY, INTERACTION_CHECK_GATEWAY } from '@ehr/medication';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { CLEARINGHOUSE_GATEWAY } from '@ehr/claims';
import { PostgresSearchIndexGateway } from '@ehr/search-adapter';
import { SEARCH_INDEX_GATEWAY } from '@ehr/query';
import { NoopNotificationGateway } from '@ehr/notification-adapter';
import { NOTIFICATION_GATEWAY } from '@ehr/messaging';
import { NoopPaymentGateway } from '@ehr/payment-adapter';
import { PAYMENT_GATEWAY } from '@ehr/portal';
import { PAYMENT_GATEWAY as PAYMENTS_PAYMENT_GATEWAY } from '@ehr/payments';
import { NoopVideoVisitGateway } from '@ehr/video-adapter';
import { VIDEO_VISIT_GATEWAY } from '@ehr/scheduling';
import { NoopAiGateway } from '@ehr/ai-adapter';
import { AI_GATEWAY, TRANSCRIPTION_GATEWAY } from '@ehr/ai';
import { NoopTranscriptionGateway } from '@ehr/transcription-adapter';
import { DB_CONNECTION, KEY_RING, IDENTITY_PROVIDER, FEDERATED_IDENTITY_PROVIDER, ENV_CONFIG } from '../common/tokens.js';

const env = getConfig();
const db = createDb({ connectionString: env.APP_DATABASE_URL });

/**
 * @Global() so every feature module (AuthModule, TenantModule, WorkforceModule, DocumentsModule)
 * can inject these without each one separately importing CoreModule — they're cross-cutting
 * infrastructure (the DB connection, signing keys, the identity provider, the policy engine),
 * not a feature-specific concern any one module should own.
 */
@Global()
@Module({
  providers: [
    { provide: ENV_CONFIG, useValue: env },
    { provide: DB_CONNECTION, useValue: db },
    {
      // A KeyRingStore, not a raw KeyRing — every consumer (the identity provider below, and the
      // Fastify auth hooks wired up in main.ts) shares this SAME instance and reads `.get()` fresh
      // per call, so `rotateSigningKey()` (mutates this process's store directly) and the
      // KEY_RING_RELOAD_INTERVAL_MS poll (picks up a rotation performed by another process/replica
      // via the shared keyring file) both take effect everywhere without a restart.
      provide: KEY_RING,
      useFactory: async () => {
        await fs.mkdir('.dev', { recursive: true }).catch(() => undefined);
        const store = await createKeyRingStore(env.JWT_KEYRING_PATH, env.JWT_PRIVATE_KEY_PATH, env.JWT_PUBLIC_KEY_PATH);
        store.startAutoReload(env.KEY_RING_RELOAD_INTERVAL_MS);
        return store;
      },
    },
    {
      provide: IDENTITY_PROVIDER,
      inject: [KEY_RING],
      useFactory: (keyRingStore) =>
        new FirstPartyIdentityProvider(db, keyRingStore, {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
          refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
        }),
    },
    {
      // No real SAML/OIDC IdP is integrated (item 23, ADR-0002) — both protocols resolve to the
      // fail-closed Noop verifier, so this provider exists and is fully wired, but cannot actually
      // authenticate anyone until a real verifier replaces one of these entries. See
      // `NoopSsoAssertionVerifier`'s own doc comment for why that's a deliberate security choice,
      // not an oversight.
      provide: FEDERATED_IDENTITY_PROVIDER,
      useFactory: () =>
        new FederatedIdentityProvider(db, {
          oidc: new NoopSsoAssertionVerifier('oidc'),
          saml: new NoopSsoAssertionVerifier('saml'),
        }),
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
    { provide: LAB_ORDER_GATEWAY, useValue: new NoopLabOrderGateway() },
    { provide: ERX_GATEWAY, useValue: new NoopPrescribingGateway() },
    { provide: INTERACTION_CHECK_GATEWAY, useValue: new NoopInteractionCheckGateway() },
    { provide: CLEARINGHOUSE_GATEWAY, useValue: new NoopClearinghouseGateway() },
    { provide: SEARCH_INDEX_GATEWAY, useValue: new PostgresSearchIndexGateway() },
    { provide: NOTIFICATION_GATEWAY, useValue: new NoopNotificationGateway() },
    { provide: PAYMENT_GATEWAY, useValue: new NoopPaymentGateway() },
    { provide: PAYMENTS_PAYMENT_GATEWAY, useValue: new NoopPaymentGateway() },
    { provide: AI_GATEWAY, useValue: new NoopAiGateway() },
    { provide: TRANSCRIPTION_GATEWAY, useValue: new NoopTranscriptionGateway() },
    { provide: VIDEO_VISIT_GATEWAY, useValue: new NoopVideoVisitGateway() },
    { provide: PolicyEngine, useValue: new PolicyEngine() },
    Reflector,
  ],
  exports: [
    ENV_CONFIG,
    DB_CONNECTION,
    KEY_RING,
    IDENTITY_PROVIDER,
    FEDERATED_IDENTITY_PROVIDER,
    OBJECT_STORAGE_GATEWAY,
    LAB_ORDER_GATEWAY,
    ERX_GATEWAY,
    INTERACTION_CHECK_GATEWAY,
    CLEARINGHOUSE_GATEWAY,
    SEARCH_INDEX_GATEWAY,
    NOTIFICATION_GATEWAY,
    PAYMENT_GATEWAY,
    PAYMENTS_PAYMENT_GATEWAY,
    AI_GATEWAY,
    TRANSCRIPTION_GATEWAY,
    VIDEO_VISIT_GATEWAY,
    PolicyEngine,
    Reflector,
  ],
})
export class CoreModule {}
