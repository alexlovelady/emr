import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { CreateClaimSchema, type CreateClaimInput } from './claim.dto.js';
import { ClaimService } from './claim.service.js';
import { CLEARINGHOUSE_GATEWAY } from '../clearinghouse-gateway.token.js';

@Controller('api/v1/patients/:patientId/claims')
export class ClaimController {
  private readonly service: ClaimService;

  constructor(@Inject(CLEARINGHOUSE_GATEWAY) gateway: ClearinghouseGateway) {
    this.service = new ClaimService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.CLAIM_EDIT)
  @Audited('claim.create', 'Claim')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateClaimSchema)) body: CreateClaimInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('claim.list', 'Claim')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/claims')
export class ClaimDetailController {
  private readonly service: ClaimService;

  constructor(@Inject(CLEARINGHOUSE_GATEWAY) gateway: ClearinghouseGateway) {
    this.service = new ClaimService(gateway);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('claim.read', 'Claim')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSION_KEYS.CLAIM_SUBMIT)
  @Audited('claim.submit', 'Claim')
  async submit(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.submit(getCurrentTransaction(), requireCtx(req), id);
  }

  // Note: `GET :id/timeline` is intentionally NOT registered here. `ClaimService.timeline()`
  // (claim + versions + denials) is a building block consumed by `@ehr/payments`' own timeline
  // controller, which composes it with Remittances (payments depends on claims, not the reverse —
  // registering the public route in both packages would collide; see README's Phase 6 scope
  // decisions).
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
