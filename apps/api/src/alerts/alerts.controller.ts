import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { AlertRepository, type AlertRow } from '@ehr/alerting';

/**
 * `alerts` is a global system table (no tenant_id RLS) — see migration 0053's doc comment — so
 * this reads/writes it through the same per-request transaction every other route uses
 * (`getCurrentTransaction()`), same as `RoleController` does for the equally-global `roles` table;
 * no special system-context wrapping is needed since no RLS policy exists on this table to bypass.
 * A platform-level permission, not a tenant-scoped one — there is exactly one `alerts` table shared
 * by every tenant on this deployment.
 */
@Controller('api/v1/alerts')
export class AlertsController {
  private readonly repo = new AlertRepository();

  @Get()
  @RequirePermission(PERMISSION_KEYS.ALERT_MANAGE)
  @Audited('alert.list', 'Alert')
  async list(@Query('status') status: string | undefined): Promise<{ alerts: AlertRow[] }> {
    if (status !== undefined && status !== 'open' && status !== 'resolved') {
      throw new ValidationError('status must be "open" or "resolved" when provided');
    }
    const alerts = await this.repo.list(getCurrentTransaction(), { ...(status ? { status } : {}), limit: 200 });
    return { alerts };
  }

  @Post(':id/resolve')
  @RequirePermission(PERMISSION_KEYS.ALERT_MANAGE)
  @Audited('alert.resolve', 'Alert')
  async resolve(@Param('id') id: string, @Req() req: FastifyRequest): Promise<AlertRow> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    return this.repo.resolveById(getCurrentTransaction(), id, ctx.actor.id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
