import { Body, Controller, Inject, Param, Post, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { Audited } from '@ehr/audit';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { PaymentGateway } from '@ehr/payment-adapter';
import { CreatePaymentPlanSchema, PayInstallmentSchema, type CreatePaymentPlanInput, type PayInstallmentInput } from './payment-plan.dto.js';
import { PaymentPlanService } from './payment-plan.service.js';
import { PaymentService } from '../payment/payment.service.js';
import { PAYMENT_GATEWAY } from '../payment-gateway.token.js';
import { requireCtx } from '../payment/payment.controller.js';

function buildService(gateway: PaymentGateway): PaymentPlanService {
  return new PaymentPlanService(undefined, undefined, new PaymentService(gateway));
}

@Controller('api/v1/patients/:patientId/payment-plans')
export class PatientPaymentPlanController {
  private readonly service: PaymentPlanService;

  constructor(@Inject(PAYMENT_GATEWAY) gateway: PaymentGateway) {
    this.service = buildService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.PAYMENT_RECORD)
  @Audited('payment_plan.create', 'PaymentPlan')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreatePaymentPlanSchema)) body: CreatePaymentPlanInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PAYMENT_RECORD)
  @Audited('payment_plan.list', 'PaymentPlan')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listByPatient(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/payment-plans')
export class PaymentPlanController {
  private readonly service: PaymentPlanService;

  constructor(@Inject(PAYMENT_GATEWAY) gateway: PaymentGateway) {
    this.service = buildService(gateway);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PAYMENT_RECORD)
  @Audited('payment_plan.read', 'PaymentPlan')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getWithInstallments(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':planId/installments/:installmentId/pay')
  @RequirePermission(PERMISSION_KEYS.PAYMENT_RECORD)
  @Audited('payment_plan.pay_installment', 'PaymentPlanInstallment')
  async payInstallment(
    @Param('planId') planId: string,
    @Param('installmentId') installmentId: string,
    @Body(new ZodValidationPipe(PayInstallmentSchema)) body: PayInstallmentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.payInstallment(getCurrentTransaction(), requireCtx(req), planId, installmentId, body);
  }
}
