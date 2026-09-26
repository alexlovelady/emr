import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { LabOrderGateway } from '@ehr/lab-adapter';
import { CreateOrderSchema, type CreateOrderInput } from './order.dto.js';
import { OrderService } from './order.service.js';
import { LAB_ORDER_GATEWAY } from '../lab-order-gateway.token.js';

@Controller('api/v1/orders')
export class OrderController {
  private readonly service: OrderService;

  constructor(@Inject(LAB_ORDER_GATEWAY) gateway: LabOrderGateway) {
    this.service = new OrderService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.ORDER_MANAGE)
  @Audited('order.create', 'Order')
  async create(@Body(new ZodValidationPipe(CreateOrderSchema)) body: CreateOrderInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('order.read', 'Order')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('order.list', 'Order')
  async list(@Query('patientId') patientId: string | undefined, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId ? { patientId } : {});
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSION_KEYS.ORDER_MANAGE)
  @Audited('order.cancel', 'Order')
  async cancel(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.cancel(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
