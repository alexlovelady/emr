import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { PaymentGateway } from '@ehr/payment-adapter';
import { ChargePaymentSchema, type ChargePaymentInput } from './portal-payment.dto.js';
import { PortalPaymentService } from './portal-payment.service.js';
import { PAYMENT_GATEWAY } from '../payment-gateway.token.js';

@Controller('api/v1/portal/patients/:patientId/payments')
@SkipAuthz()
export class PortalPaymentController {
  private readonly service: PortalPaymentService;

  constructor(@Inject(PAYMENT_GATEWAY) gateway: PaymentGateway) {
    this.service = new PortalPaymentService(gateway);
  }

  @Post()
  @Audited('portal_payment.charge', 'LedgerEntry')
  async charge(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(ChargePaymentSchema)) body: ChargePaymentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.charge(getCurrentTransaction(), requirePortalCtx(req), patientId, body);
  }
}

function requirePortalCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext;
}
