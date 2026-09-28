import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateBillingRuleSchema,
  UpdateBillingRuleStatusSchema,
  type CreateBillingRuleInput,
  type UpdateBillingRuleStatusInput,
} from './billing-rule.dto.js';
import { BillingRuleService } from './billing-rule.service.js';

@Controller('api/v1/billing-rules')
export class BillingRuleController {
  constructor(private readonly service: BillingRuleService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.BILLING_RULE_MANAGE)
  @Audited('billing_rule.create', 'BillingRule')
  async create(@Body(new ZodValidationPipe(CreateBillingRuleSchema)) body: CreateBillingRuleInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.BILLING_RULE_MANAGE)
  @Audited('billing_rule.list', 'BillingRule')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }

  @Post(':id/status')
  @RequirePermission(PERMISSION_KEYS.BILLING_RULE_MANAGE)
  @Audited('billing_rule.update_status', 'BillingRule')
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBillingRuleStatusSchema)) body: UpdateBillingRuleStatusInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.updateStatus(getCurrentTransaction(), requireCtx(req), id, body.status);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
