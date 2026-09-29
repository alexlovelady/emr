import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission, BreakglassGrantRepository, type BreakglassGrantRow } from '@ehr/authz';
import { PatientRepository } from '@ehr/patient';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { BreakglassInvokeSchema, type BreakglassInvokeInput } from '../auth/auth.dto.js';

/**
 * Item 22 layer 8 (§6.3): the explicit user action that creates a real, time-limited emergency
 * access grant — see `packages/db/migrations/0056_breakglass_grants.ts` and
 * `packages/authz/src/layers/break-glass.layer.ts` for the full mechanism this feeds. The
 * `@Audited` event below IS the "elevated audit event" spec §6.3 calls for: it captures the grant's
 * id, reason code, justification, and target patient in the same audit trail every other write
 * already goes through, so no separate elevated-severity system was invented for this.
 */
@Controller('api/v1/auth/breakglass')
export class BreakglassController {
  private readonly repo = new BreakglassGrantRepository();
  private readonly patientRepo = new PatientRepository();

  @Post()
  @RequirePermission(PERMISSION_KEYS.BREAKGLASS_INVOKE)
  @Audited('auth.breakglass_invoke', 'BreakglassGrant')
  async invoke(@Body(new ZodValidationPipe(BreakglassInvokeSchema)) body: BreakglassInvokeInput, @Req() req: FastifyRequest): Promise<BreakglassGrantRow> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');

    const patient = await this.patientRepo.findById(getCurrentTransaction(), ctx.tenantId, body.patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId: body.patientId });

    return this.repo.invoke(getCurrentTransaction(), {
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      patientId: body.patientId,
      reasonCode: body.reasonCode,
      justification: body.justification,
      expiresAt: new Date(Date.now() + body.durationMinutes * 60_000),
      createdBy: ctx.actor.id,
    });
  }

  @Post(':id/revoke')
  @RequirePermission(PERMISSION_KEYS.BREAKGLASS_INVOKE)
  @Audited('auth.breakglass_revoke', 'BreakglassGrant')
  async revoke(@Param('id') id: string, @Req() req: FastifyRequest): Promise<BreakglassGrantRow> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    return this.repo.revoke(getCurrentTransaction(), ctx.tenantId, id, ctx.actor.id);
  }

  /** The compliance-review half of spec §6.3's "review queue" — see
   * `packages/alerting`'s `breakglass_review` rule, which stops flagging a grant once this runs. */
  @Post(':id/review')
  @RequirePermission(PERMISSION_KEYS.BREAKGLASS_REVIEW)
  @Audited('auth.breakglass_review', 'BreakglassGrant')
  async review(@Param('id') id: string, @Req() req: FastifyRequest): Promise<BreakglassGrantRow> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    return this.repo.review(getCurrentTransaction(), ctx.tenantId, id, ctx.actor.id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.BREAKGLASS_REVIEW)
  @Audited('auth.breakglass_list', 'BreakglassGrant')
  async list(@Req() req: FastifyRequest): Promise<{ grants: BreakglassGrantRow[] }> {
    const ctx = requireCtx(req);
    const grants = await this.repo.list(getCurrentTransaction(), ctx.tenantId);
    return { grants };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
