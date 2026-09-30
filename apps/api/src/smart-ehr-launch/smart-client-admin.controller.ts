import { randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ConflictError, ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateSmartClientSchema,
  UpdateSmartClientSchema,
  type CreateSmartClientInput,
  type UpdateSmartClientInput,
} from './smart-client-admin.dto.js';

export interface SmartClientAdminView {
  id: string;
  clientId: string;
  displayName: string;
  description: string | null;
  developerName: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  allowedScopes: string[];
  redirectUris: string[];
  clientType: string;
  launchUri: string | null;
  status: string;
  createdAt: Date;
}

/**
 * Epic-parity item 4 — a per-tenant SMART-app catalog (Epic's App Orchard/Showroom, scoped to what's
 * actually buildable without a real cross-tenant installed base: `smart_clients` is tenant-scoped
 * with RLS, so this is "the apps this practice has registered/enabled," not a shared vendor
 * directory). Reuses the existing but previously-unused `API_MANAGE_CLIENTS` permission key rather
 * than minting a new one. Raw Kysely here, no repository/service layer — matches
 * `SmartEhrLaunchController`'s existing style for this same table/feature area rather than
 * introducing a new layering convention for one small admin surface.
 */
@Controller('api/v1/smart-clients/admin')
export class SmartClientAdminController {
  @Get()
  @RequirePermission(PERMISSION_KEYS.API_MANAGE_CLIENTS)
  @Audited('smart_client.admin_list', 'SmartClient')
  async list(@Req() req: FastifyRequest): Promise<SmartClientAdminView[]> {
    const ctx = requireCtx(req);
    const rows = await getCurrentTransaction()
      .selectFrom('smart_clients')
      .selectAll()
      .where('tenant_id', '=', ctx.tenantId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toView);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.API_MANAGE_CLIENTS)
  @Audited('smart_client.register', 'SmartClient')
  async create(
    @Body(new ZodValidationPipe(CreateSmartClientSchema)) body: CreateSmartClientInput,
    @Req() req: FastifyRequest,
  ): Promise<SmartClientAdminView & { clientSecret: string }> {
    const ctx = requireCtx(req);
    const clientId = randomUUID();
    const clientSecret = randomBytes(32).toString('hex');
    const clientSecretHash = await argon2.hash(clientSecret, { type: argon2.argon2id });

    const row = await getCurrentTransaction()
      .insertInto('smart_clients')
      .values({
        tenant_id: ctx.tenantId,
        client_id: clientId,
        client_secret_hash: clientSecretHash,
        display_name: body.displayName,
        description: body.description ?? null,
        developer_name: body.developerName ?? null,
        website_url: body.websiteUrl ?? null,
        logo_url: body.logoUrl ?? null,
        allowed_scopes: body.allowedScopes,
        redirect_uris: body.redirectUris,
        client_type: body.clientType,
        launch_uri: body.launchUri ?? null,
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // The plaintext secret is only ever available in this one response — only the hash is stored.
    return { ...toView(row), clientSecret };
  }

  @Patch(':id')
  @RequirePermission(PERMISSION_KEYS.API_MANAGE_CLIENTS)
  @Audited('smart_client.update', 'SmartClient')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSmartClientSchema)) body: UpdateSmartClientInput,
    @Req() req: FastifyRequest,
  ): Promise<SmartClientAdminView> {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();
    await this.requireOwnRow(trx, ctx, id);

    const row = await trx
      .updateTable('smart_clients')
      .set({
        ...(body.displayName !== undefined ? { display_name: body.displayName } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.developerName !== undefined ? { developer_name: body.developerName ?? null } : {}),
        ...(body.websiteUrl !== undefined ? { website_url: body.websiteUrl ?? null } : {}),
        ...(body.logoUrl !== undefined ? { logo_url: body.logoUrl ?? null } : {}),
        ...(body.allowedScopes !== undefined ? { allowed_scopes: body.allowedScopes } : {}),
        ...(body.redirectUris !== undefined ? { redirect_uris: body.redirectUris } : {}),
        ...(body.launchUri !== undefined ? { launch_uri: body.launchUri ?? null } : {}),
        updated_at: new Date(),
      })
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toView(row);
  }

  @Post(':id/deactivate')
  @RequirePermission(PERMISSION_KEYS.API_MANAGE_CLIENTS)
  @Audited('smart_client.deactivate', 'SmartClient')
  async deactivate(@Param('id') id: string, @Req() req: FastifyRequest): Promise<SmartClientAdminView> {
    return this.setStatus(id, requireCtx(req), 'active', 'inactive');
  }

  @Post(':id/activate')
  @RequirePermission(PERMISSION_KEYS.API_MANAGE_CLIENTS)
  @Audited('smart_client.activate', 'SmartClient')
  async activate(@Param('id') id: string, @Req() req: FastifyRequest): Promise<SmartClientAdminView> {
    return this.setStatus(id, requireCtx(req), 'inactive', 'active');
  }

  private async setStatus(id: string, ctx: RequestContext, expected: string, next: string): Promise<SmartClientAdminView> {
    const trx = getCurrentTransaction();
    const current = await this.requireOwnRow(trx, ctx, id);
    if (current.status !== expected) {
      throw new ConflictError(`SMART client is not ${expected}`, { id, status: current.status });
    }
    const row = await trx
      .updateTable('smart_clients')
      .set({ status: next, updated_at: new Date() })
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toView(row);
  }

  private async requireOwnRow(trx: ReturnType<typeof getCurrentTransaction>, ctx: RequestContext, id: string) {
    const row = await trx.selectFrom('smart_clients').selectAll().where('tenant_id', '=', ctx.tenantId).where('id', '=', id).executeTakeFirst();
    if (!row) throw new NotFoundError('SMART client not found', { id });
    return row;
  }
}

function toView(row: {
  id: string;
  client_id: string;
  display_name: string;
  description: string | null;
  developer_name: string | null;
  website_url: string | null;
  logo_url: string | null;
  allowed_scopes: string[];
  redirect_uris: string[];
  client_type: string;
  launch_uri: string | null;
  status: string;
  created_at: Date;
}): SmartClientAdminView {
  return {
    id: row.id,
    clientId: row.client_id,
    displayName: row.display_name,
    description: row.description,
    developerName: row.developer_name,
    websiteUrl: row.website_url,
    logoUrl: row.logo_url,
    allowedScopes: row.allowed_scopes,
    redirectUris: row.redirect_uris,
    clientType: row.client_type,
    launchUri: row.launch_uri,
    status: row.status,
    createdAt: row.created_at,
  };
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
