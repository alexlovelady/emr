import type { Kysely, Selectable, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '@ehr/db';

export interface PatientProxyGrantRow {
  id: string;
  tenantId: string;
  patientId: string;
  portalAccountId: string;
  relationshipType: string;
  scope: string[];
  effectiveStart: string;
  effectiveEnd: string | null;
  grantedBy: string | null;
  authorityDocumentId: string | null;
  revokedAt: Date | null;
  revocationReason: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export interface CreateProxyGrantRecord {
  tenantId: string;
  patientId: string;
  portalAccountId: string;
  relationshipType: string;
  scope: string[];
  effectiveStart: string | null;
  effectiveEnd: string | null;
  grantedBy: string | null;
  authorityDocumentId: string | null;
  createdBy: string;
}

export class ProxyGrantRepository {
  async create(trx: Executor, input: CreateProxyGrantRecord): Promise<PatientProxyGrantRow> {
    const row = await trx
      .insertInto('patient_proxy_grants')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        portal_account_id: input.portalAccountId,
        relationship_type: input.relationshipType,
        scope: input.scope,
        ...(input.effectiveStart ? { effective_start: input.effectiveStart } : {}),
        effective_end: input.effectiveEnd,
        granted_by: input.grantedBy,
        authority_document_id: input.authorityDocumentId,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PatientProxyGrantRow | null> {
    const row = await trx
      .selectFrom('patient_proxy_grants')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<PatientProxyGrantRow[]> {
    const rows = await trx
      .selectFrom('patient_proxy_grants')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async listActiveByPortalAccount(trx: Executor, tenantId: string, portalAccountId: string): Promise<PatientProxyGrantRow[]> {
    const rows = await trx
      .selectFrom('patient_proxy_grants')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('portal_account_id', '=', portalAccountId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  /**
   * The one query `ConsentService.assertAccess` relies on: active (never revoked) AND within its
   * effective-date window. This intentionally does not consider `scope` — any active grant
   * currently grants full access (see migration 0029's doc comment).
   */
  async findActiveGrant(
    trx: Executor,
    tenantId: string,
    portalAccountId: string,
    patientId: string,
  ): Promise<PatientProxyGrantRow | null> {
    const row = await trx
      .selectFrom('patient_proxy_grants')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('portal_account_id', '=', portalAccountId)
      .where('patient_id', '=', patientId)
      .where('revoked_at', 'is', null)
      .where('effective_start', '<=', sql<Date>`current_date`)
      .where((eb) => eb.or([eb('effective_end', 'is', null), eb('effective_end', '>=', sql<Date>`current_date`)]))
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async revoke(trx: Executor, tenantId: string, id: string, reason: string | null, updatedBy: string): Promise<PatientProxyGrantRow> {
    const row = await trx
      .updateTable('patient_proxy_grants')
      .set({
        revoked_at: new Date(),
        revocation_reason: reason,
        status: 'revoked',
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

/**
 * Minimal existence check against `portal_accounts`, owned in full by `@ehr/portal` (which depends
 * on `@ehr/consent`, not the other way around — so this domain can't import a repository from
 * there). `ConsentService.create()` uses this to validate a grant's `portalAccountId` before
 * inserting, the same "validate the foreign relationship first" pattern used for `patientId` via
 * `@ehr/patient`'s `PatientRepository.findById`.
 */
export async function portalAccountExists(trx: Executor, tenantId: string, portalAccountId: string): Promise<boolean> {
  const row = await trx
    .selectFrom('portal_accounts')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('id', '=', portalAccountId)
    .executeTakeFirst();
  return row !== undefined;
}

function toRow(dbRow: Selectable<DB['patient_proxy_grants']>): PatientProxyGrantRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    portalAccountId: dbRow.portal_account_id,
    relationshipType: dbRow.relationship_type,
    scope: dbRow.scope,
    effectiveStart: formatDate(dbRow.effective_start),
    effectiveEnd: dbRow.effective_end ? formatDate(dbRow.effective_end) : null,
    grantedBy: dbRow.granted_by,
    authorityDocumentId: dbRow.authority_document_id,
    revokedAt: dbRow.revoked_at,
    revocationReason: dbRow.revocation_reason,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

/** `date` columns come back from `pg` as a JS Date; normalize to a plain YYYY-MM-DD string. */
function formatDate(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}
