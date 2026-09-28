import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { PaymentGateway } from '@ehr/payment-adapter';
import { RecordPaymentSchema, type RecordPaymentInput } from './payment.dto.js';
import { PaymentService } from './payment.service.js';
import { PAYMENT_GATEWAY } from '../payment-gateway.token.js';

/** Staff-facing multi-method payment recording — see PaymentService's doc comment for why this is
 * separate from `@ehr/portal`'s patient self-pay endpoint. */
@Controller('api/v1/patients/:patientId/payments')
export class PaymentController {
  private readonly service: PaymentService;

  constructor(@Inject(PAYMENT_GATEWAY) gateway: PaymentGateway) {
    this.service = new PaymentService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.PAYMENT_RECORD)
  @Audited('payment.record', 'LedgerEntry')
  async charge(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(RecordPaymentSchema)) body: RecordPaymentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.charge(getCurrentTransaction(), requireCtx(req), patientId, body);
  }
}

export function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
