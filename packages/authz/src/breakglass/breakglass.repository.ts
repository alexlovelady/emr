import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface BreakglassGrantRow {
  id: string;
  tenantId: string;
  userId: string;
  patientId: string;
  reasonCode: string;
  justification: string;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** Item 22 layer 8 — see migration 0056's doc comment for the full spec §6.3 mapping. */
export class BreakglassGrantRepository {
  async invoke(
    trx: Executor,
    input: { tenantId: string; userId: string; patientId: string; reasonCode: string; justification: string; expiresAt: Date; createdBy: string },
  ): Promise<BreakglassGrantRow> {
    const row = await trx
      .insertInto('breakglass_grants')
      .values({
        tenant_id: input.tenantId,
        user_id: input.userId,
        patient_id: input.patientId,
        reason_code: input.reasonCode,
        justification: input.justification,
        expires_at: input.expiresAt,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<BreakglassGrantRow | null> {
    const row = await trx.selectFrom('breakglass_grants').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async revoke(trx: Executor, tenantId: string, id: string, revokedBy: string): Promise<BreakglassGrantRow> {
    const row = await trx
      .updateTable('breakglass_grants')
      .set({ revoked_at: new Date(), revoked_by: revokedBy, updated_by: revokedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /** Marks a grant as having gone through the compliance review queue — see
   * `packages/alerting`'s `breakglass_review` rule, which stops flagging a grant once this is set. */
  async review(trx: Executor, tenantId: string, id: string, reviewedBy: string): Promise<BreakglassGrantRow> {
    const row = await trx
      .updateTable('breakglass_grants')
      .set({ reviewed_at: new Date(), reviewed_by: reviewedBy, updated_by: reviewedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async list(trx: Executor, tenantId: string, opts: { unreviewedOnly?: boolean } = {}): Promise<BreakglassGrantRow[]> {
    let query = trx.selectFrom('breakglass_grants').selectAll().where('tenant_id', '=', tenantId).orderBy('granted_at', 'desc');
    if (opts.unreviewedOnly) query = query.where('reviewed_at', 'is', null);
    const rows = await query.execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['breakglass_grants']>): BreakglassGrantRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    userId: dbRow.user_id,
    patientId: dbRow.patient_id,
    reasonCode: dbRow.reason_code,
    justification: dbRow.justification,
    grantedAt: dbRow.granted_at,
    expiresAt: dbRow.expires_at,
    revokedAt: dbRow.revoked_at,
    revokedBy: dbRow.revoked_by,
    reviewedAt: dbRow.reviewed_at,
    reviewedBy: dbRow.reviewed_by,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
