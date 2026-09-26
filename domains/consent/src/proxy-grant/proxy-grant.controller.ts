import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateProxyGrantSchema, RevokeProxyGrantSchema, type CreateProxyGrantInput, type RevokeProxyGrantInput } from './proxy-grant.dto.js';
import { ConsentService } from './proxy-grant.service.js';

/** Staff-facing only — portal accounts never manage their own grants (`@ehr/portal` only reads them). */
@Controller('api/v1/patients/:patientId/proxy-grants')
export class ProxyGrantController {
  constructor(private readonly service: ConsentService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PROXY_GRANT_MANAGE)
  @Audited('proxy_grant.create', 'ProxyGrant')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateProxyGrantSchema)) body: CreateProxyGrantInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PROXY_GRANT_MANAGE)
  @Audited('proxy_grant.list', 'ProxyGrant')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listByPatient(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/proxy-grants')
export class ProxyGrantRevocationController {
  constructor(private readonly service: ConsentService) {}

  @Post(':id/revoke')
  @RequirePermission(PERMISSION_KEYS.PROXY_GRANT_MANAGE)
  @Audited('proxy_grant.revoke', 'ProxyGrant')
  async revoke(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RevokeProxyGrantSchema)) body: RevokeProxyGrantInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.revoke(getCurrentTransaction(), requireCtx(req), id, body.reason ?? null);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
