import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { SsoProtocol } from './sso.js';

export interface TenantSsoConfigRow {
  id: string;
  tenantId: string;
  protocol: SsoProtocol;
  enabled: boolean;
  issuer: string;
  clientId: string | null;
  metadataUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface TenantSsoConfigUpsertInput {
  protocol: SsoProtocol;
  enabled: boolean;
  issuer: string;
  clientId: string | null;
  metadataUrl: string | null;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** Item 23 — see migration 0057's doc comment. One row per tenant: `upsert` replaces whichever
 * config already exists rather than requiring a separate create/update distinction, since a tenant
 * switching IdPs (or protocols) replaces its config wholesale rather than editing it in place. */
export class TenantSsoConfigRepository {
  async get(trx: Executor, tenantId: string): Promise<TenantSsoConfigRow | null> {
    const row = await trx.selectFrom('tenant_sso_configs').selectAll().where('tenant_id', '=', tenantId).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async upsert(trx: Executor, tenantId: string, input: TenantSsoConfigUpsertInput, actorId: string): Promise<TenantSsoConfigRow> {
    const row = await trx
      .insertInto('tenant_sso_configs')
      .values({
        tenant_id: tenantId,
        protocol: input.protocol,
        enabled: input.enabled,
        issuer: input.issuer,
        client_id: input.clientId,
        metadata_url: input.metadataUrl,
        status: 'active',
        created_by: actorId,
        updated_by: actorId,
      })
      .onConflict((oc) =>
        oc.column('tenant_id').doUpdateSet({
          protocol: input.protocol,
          enabled: input.enabled,
          issuer: input.issuer,
          client_id: input.clientId,
          metadata_url: input.metadataUrl,
          updated_by: actorId,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['tenant_sso_configs']>): TenantSsoConfigRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    protocol: dbRow.protocol as SsoProtocol,
    enabled: dbRow.enabled,
    issuer: dbRow.issuer,
    clientId: dbRow.client_id,
    metadataUrl: dbRow.metadata_url,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
