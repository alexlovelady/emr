import * as argon2 from 'argon2';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { withSystemContext, withTenantContext, type DB } from '@ehr/db';
import { recordAuditEvent } from '@ehr/audit';
import { PatientRepository } from '@ehr/patient';
import { ConsentService } from '@ehr/consent';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  generateRefreshSecret,
  hashRefreshSecret,
  InvalidRefreshTokenError,
  signPortalAccessToken,
  type KeyMaterial,
  type PortalTokenIssuerConfig,
} from '@ehr/auth-adapter';
import { DB_CONNECTION, ENV_CONFIG, KEY_MATERIAL } from '../common/tokens.js';
import type { Env } from '@ehr/config';
import { PortalAccountRepository } from './portal-account.repository.js';

export interface PortalTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PortalRequestMeta {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export class InvalidPortalRegistrationError extends Error {}
export class InvalidPortalCredentialsError extends Error {}

/**
 * Portal registration/login/refresh/logout — the portal counterpart to `apps/api/src/auth`'s
 * `AuthService`, living in apps/api for the exact same reason: these routes run before any
 * request-scoped transaction exists (no tenant is known yet for register/login; refresh/logout
 * only carry an opaque refresh token), so they can't use `getCurrentTransaction()` and must hold
 * the raw pool connection directly — the same constraint documented on `AuthService` itself.
 */
@Injectable()
export class PortalAuthService {
  private readonly accountRepo = new PortalAccountRepository();
  private readonly patientRepo = new PatientRepository();
  private readonly consentService = new ConsentService();

  constructor(
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
    @Inject(KEY_MATERIAL) private readonly keys: KeyMaterial,
    @Inject(ENV_CONFIG) private readonly env: Env,
  ) {}

  private get tokenConfig(): PortalTokenIssuerConfig {
    return {
      issuer: this.env.JWT_ISSUER,
      audience: this.env.PORTAL_JWT_AUDIENCE,
      accessTokenTtlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async register(input: {
    tenantSlug: string;
    email: string;
    password: string;
    patientId: string;
    dateOfBirth: string;
  }, meta: PortalRequestMeta): Promise<PortalTokenPair> {
    const tenant = await withSystemContext(this.db, (trx) =>
      trx.selectFrom('tenants').select(['id']).where('slug', '=', input.tenantSlug).where('status', '=', 'active').executeTakeFirst(),
    );
    if (!tenant) throw new InvalidPortalRegistrationError('Patient identity could not be verified');

    const passwordHash = await argon2.hash(input.password);

    const account = await withTenantContext(this.db, tenant.id, async (trx) => {
      // Deliberately the same error/message whether the patient doesn't exist or the DOB doesn't
      // match — do not reveal whether a given patientId is real (same posture as login's "don't
      // reveal whether the email exists").
      const patient = await this.patientRepo.findById(trx, tenant.id, input.patientId);
      if (!patient || patient.dateOfBirth !== input.dateOfBirth) {
        throw new InvalidPortalRegistrationError('Patient identity could not be verified');
      }

      const created = await this.accountRepo.create(trx, { tenantId: tenant.id, email: input.email, passwordHash });
      await this.consentService.createSelfGrant(trx, tenant.id, input.patientId, created.id);
      return created;
    });

    const tokens = await this.issueTokens(account.id, tenant.id);
    await this.auditPortalEvent(tenant.id, account.id, 'portal_auth.register', 'success', meta);
    return tokens;
  }

  async login(tenantSlug: string, email: string, password: string, meta: PortalRequestMeta): Promise<PortalTokenPair> {
    const tenant = await withSystemContext(this.db, (trx) =>
      trx.selectFrom('tenants').select(['id']).where('slug', '=', tenantSlug).where('status', '=', 'active').executeTakeFirst(),
    );
    if (!tenant) throw new InvalidPortalCredentialsError('Unknown tenant, or invalid email/password');

    const account = await withTenantContext(this.db, tenant.id, (trx) => this.accountRepo.findByEmail(trx, tenant.id, email));
    if (!account || account.status !== 'active') {
      throw new InvalidPortalCredentialsError('Unknown tenant, or invalid email/password');
    }

    const valid = await argon2.verify(account.passwordHash, password);
    if (!valid) throw new InvalidPortalCredentialsError('Unknown tenant, or invalid email/password');

    await withTenantContext(this.db, tenant.id, (trx) => this.accountRepo.updateLastLogin(trx, tenant.id, account.id, new Date()));

    const tokens = await this.issueTokens(account.id, tenant.id);
    await this.auditPortalEvent(tenant.id, account.id, 'portal_auth.login', 'success', meta);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<PortalTokenPair> {
    const { tenantId, secret } = decodeRefreshToken(refreshToken);
    const tokenHash = hashRefreshSecret(secret);

    const row = await withTenantContext(this.db, tenantId, (trx) =>
      trx
        .selectFrom('portal_refresh_tokens')
        .select(['id', 'portal_account_id', 'expires_at', 'revoked_at'])
        .where('token_hash', '=', tokenHash)
        .executeTakeFirst(),
    );
    if (!row || row.revoked_at !== null || row.expires_at.getTime() < Date.now()) {
      throw new InvalidRefreshTokenError('Refresh token is invalid, expired, or revoked');
    }

    await withTenantContext(this.db, tenantId, (trx) =>
      trx.updateTable('portal_refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', row.id).execute(),
    );

    return this.issueTokens(row.portal_account_id, tenantId);
  }

  async logout(refreshToken: string): Promise<void> {
    let decoded;
    try {
      decoded = decodeRefreshToken(refreshToken);
    } catch {
      return;
    }
    await withTenantContext(this.db, decoded.tenantId, (trx) =>
      trx
        .updateTable('portal_refresh_tokens')
        .set({ revoked_at: new Date() })
        .where('token_hash', '=', hashRefreshSecret(decoded.secret))
        .execute(),
    );
  }

  private async issueTokens(portalAccountId: string, tenantId: string): Promise<PortalTokenPair> {
    const accessToken = await signPortalAccessToken({ portalAccountId, tenantId }, this.keys, this.tokenConfig);

    const secret = generateRefreshSecret();
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000);
    await withTenantContext(this.db, tenantId, (trx) =>
      trx
        .insertInto('portal_refresh_tokens')
        .values({
          tenant_id: tenantId,
          portal_account_id: portalAccountId,
          token_hash: hashRefreshSecret(secret),
          expires_at: expiresAt,
          status: 'active',
        })
        .execute(),
    );

    return { accessToken, refreshToken: encodeRefreshToken(tenantId, secret) };
  }

  private async auditPortalEvent(
    tenantId: string,
    portalAccountId: string,
    action: string,
    outcome: 'success' | 'failure',
    meta: PortalRequestMeta,
  ): Promise<void> {
    await withTenantContext(this.db, tenantId, (trx) =>
      recordAuditEvent(trx, {
        tenantId,
        actor: { type: 'patient', id: portalAccountId },
        action,
        resource: { type: 'PortalSession', id: null },
        requestId: meta.requestId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        outcome,
      }),
    );
  }
}
