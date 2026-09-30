import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { AlertRepository, type AlertRow } from '@ehr/alerting';
import { PatientRepository } from '@ehr/patient';
import { CARE_GAP_RULE_KEYS, type CareGapWorklistItem } from './care-gaps.dto.js';

/**
 * Epic-parity item 2 (population health / "Healthy Planet" equivalent): a clinical worklist over
 * the same `alerts` table `apps/api/src/alerts/alerts.controller.ts` already exposes generically,
 * but deliberately NOT that same generic endpoint — three real differences justify a separate
 * surface:
 *   1. Permission model — `ALERT_MANAGE` is a platform-admin-only concern (ops alerts: backup
 *      health, outbox backlog); a care-gap worklist is a clinical population-health workflow
 *      meant for practicing staff broadly, gated on the new `CARE_GAP_MANAGE` instead.
 *   2. Tenant isolation — `alerts` has no RLS (migration 0053's doc comment), and the generic
 *      `AlertsController.list()` does not filter by tenant at all (a real pre-existing gap,
 *      harmless for platform-wide findings like backup health but not for patient-linked ones).
 *      Every read here is explicitly scoped to `ctx.tenantId` via
 *      `AlertRepository.listOpenByTenantAndRuleKeys`.
 *   3. Shape — the worklist is patient-grouped with a resolved patient name, not a flat
 *      rule-agnostic alert row.
 */
@Controller('api/v1/care-gaps')
export class CareGapsController {
  private readonly alertRepo = new AlertRepository();
  private readonly patientRepo = new PatientRepository();

  @Get()
  @RequirePermission(PERMISSION_KEYS.CARE_GAP_MANAGE)
  @Audited('care_gap.list', 'CareGap')
  async list(@Req() req: FastifyRequest): Promise<CareGapWorklistItem[]> {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();
    const alerts = await this.alertRepo.listOpenByTenantAndRuleKeys(trx, ctx.tenantId, [...CARE_GAP_RULE_KEYS]);

    const patientIds = [...new Set(alerts.map((a) => patientIdOf(a)).filter((id): id is string => id !== null))];
    const patients = await Promise.all(patientIds.map((id) => this.patientRepo.findById(trx, ctx.tenantId, id)));
    const nameByPatientId = new Map(patients.filter((p) => p !== null).map((p) => [p.id, `${p.givenName} ${p.familyName}`]));

    return alerts.map((a) => {
      const patientId = patientIdOf(a);
      return {
        id: a.id,
        ruleKey: a.ruleKey,
        severity: a.severity,
        title: a.title,
        detail: a.detail,
        openedAt: a.openedAt,
        patientId,
        patientName: patientId ? (nameByPatientId.get(patientId) ?? null) : null,
      };
    });
  }

  @Post(':id/resolve')
  @RequirePermission(PERMISSION_KEYS.CARE_GAP_MANAGE)
  @Audited('care_gap.resolve', 'CareGap')
  async resolve(@Param('id') id: string, @Req() req: FastifyRequest): Promise<AlertRow> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    const trx = getCurrentTransaction();

    // Re-derive via the tenant-scoped list rather than trusting the raw id alone — the same
    // belt-and-suspenders reasoning as the controller doc comment: `alerts` has no RLS, so a
    // resolve-by-id with no tenant check would let a caller resolve another tenant's care gap by
    // guessing/enumerating ids.
    const own = await this.alertRepo.listOpenByTenantAndRuleKeys(trx, ctx.tenantId, [...CARE_GAP_RULE_KEYS]);
    if (!own.some((a) => a.id === id)) throw new NotFoundError('Care gap not found', { id });

    return this.alertRepo.resolveById(trx, id, ctx.actor.id);
  }
}

function patientIdOf(alert: AlertRow): string | null {
  const value = alert.detail.patientId;
  return typeof value === 'string' ? value : null;
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
