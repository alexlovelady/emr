import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import type { CreateProxyGrantInput } from './proxy-grant.dto.js';
import { portalAccountExists, ProxyGrantRepository, type PatientProxyGrantRow } from './proxy-grant.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * `assertAccess` is the load-bearing method of this whole domain: every `@ehr/portal` and
 * `@ehr/messaging` portal-facing service method calls it first. It throws `NotFoundError` (404,
 * not 403) whenever no active grant exists — including for a genuinely nonexistent patient, an
 * unrevoked-but-expired grant, and a revoked grant — so a portal account can never distinguish
 * "this patient doesn't exist" from "you have no access to this patient" (EHR_BUILD_SPEC.md
 * §18.2's tenant-isolation philosophy, applied to proxy access instead of cross-tenant access).
 */
export class ConsentService {
  constructor(
    private readonly repo: ProxyGrantRepository = new ProxyGrantRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async assertAccess(trx: Executor, tenantId: string, portalAccountId: string, patientId: string): Promise<PatientProxyGrantRow> {
    const grant = await this.repo.findActiveGrant(trx, tenantId, portalAccountId, patientId);
    if (!grant) {
      throw new NotFoundError('Patient not found', { patientId });
    }
    return grant;
  }

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateProxyGrantInput): Promise<PatientProxyGrantRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const accountExists = await portalAccountExists(trx, ctx.tenantId, input.portalAccountId);
    if (!accountExists) throw new NotFoundError('Portal account not found', { portalAccountId: input.portalAccountId });

    const actorId = ctx.actor?.id ?? null;
    const grant = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      portalAccountId: input.portalAccountId,
      relationshipType: input.relationshipType,
      scope: input.scope,
      effectiveStart: input.effectiveStart ?? null,
      effectiveEnd: input.effectiveEnd ?? null,
      grantedBy: actorId,
      authorityDocumentId: input.authorityDocumentId ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, grant, 'proxy_grant.created.v1', {
      patientId,
      portalAccountId: grant.portalAccountId,
      relationshipType: grant.relationshipType,
    });

    return grant;
  }

  /**
   * Called by `@ehr/portal`'s registration flow, not through this domain's own controller — a
   * self-grant has no staff actor (`grantedBy: null`) and is auto-created the moment a portal
   * account proves it knows an existing patient's id + date of birth.
   */
  async createSelfGrant(trx: Executor, tenantId: string, patientId: string, portalAccountId: string): Promise<PatientProxyGrantRow> {
    const grant = await this.repo.create(trx, {
      tenantId,
      patientId,
      portalAccountId,
      relationshipType: 'self',
      scope: [],
      effectiveStart: null,
      effectiveEnd: null,
      grantedBy: null,
      authorityDocumentId: null,
      createdBy: portalAccountId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'proxy_grant.created.v1',
          tenant_id: tenantId,
          aggregate_type: 'patient_proxy_grant',
          aggregate_id: grant.id,
          aggregate_version: grant.version,
          actor_id: portalAccountId,
          correlation_id: randomUUID(),
          causation_id: null,
          data: { patientId, portalAccountId, relationshipType: 'self' },
        }),
      )
      .execute();

    return grant;
  }

  async listByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<PatientProxyGrantRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  /**
   * No `RequestContext`/existence check, unlike `listByPatient` — for internal cross-domain use
   * (e.g. `@ehr/messaging` resolving which portal accounts to notify) where the caller has already
   * validated the patient/thread exists. Filters out revoked grants; does not check the
   * effective-date window (a notification firing for a grant that's active-but-expiring-soon is a
   * low-severity content-free ping, not a security concern the way `assertAccess` is).
   */
  async listActiveGrantsByPatient(trx: Executor, tenantId: string, patientId: string): Promise<PatientProxyGrantRow[]> {
    const grants = await this.repo.listByPatient(trx, tenantId, patientId);
    return grants.filter((grant) => grant.revokedAt === null);
  }

  async listActiveByPortalAccount(trx: Executor, tenantId: string, portalAccountId: string): Promise<PatientProxyGrantRow[]> {
    return this.repo.listActiveByPortalAccount(trx, tenantId, portalAccountId);
  }

  async revoke(trx: Executor, ctx: RequestContext, id: string, reason: string | null): Promise<PatientProxyGrantRow> {
    const existing = await this.repo.findById(trx, ctx.tenantId, id);
    if (!existing) throw new NotFoundError('Proxy grant not found', { id });

    const actorId = ctx.actor?.id ?? null;
    const grant = await this.repo.revoke(trx, ctx.tenantId, id, reason, actorId ?? ctx.tenantId);

    await this.emit(trx, ctx, grant, 'proxy_grant.revoked.v1', { patientId: grant.patientId, reason });

    return grant;
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    grant: PatientProxyGrantRow,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient_proxy_grant',
          aggregate_id: grant.id,
          aggregate_version: grant.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
