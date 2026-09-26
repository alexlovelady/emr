import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { OrderRepository } from '../order/order.repository.js';
import type { CreateSpecimenInput } from './specimen.dto.js';
import { SpecimenRepository, type SpecimenRow } from './specimen.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class SpecimenService {
  constructor(
    private readonly repo: SpecimenRepository = new SpecimenRepository(),
    private readonly orderRepo: OrderRepository = new OrderRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, orderId: string, input: CreateSpecimenInput): Promise<SpecimenRow> {
    const order = await this.orderRepo.findById(trx, ctx.tenantId, orderId);
    if (!order) throw new NotFoundError('Order not found', { orderId });

    const actorId = ctx.actor?.id ?? null;
    const specimen = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      orderId,
      specimenType: input.specimenType,
      accessionNumber: input.accessionNumber ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'specimen.collected.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'specimen',
          aggregate_id: specimen.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { orderId, specimenType: specimen.specimenType },
        }),
      )
      .execute();

    return specimen;
  }

  async list(trx: Executor, ctx: RequestContext, orderId: string): Promise<SpecimenRow[]> {
    const order = await this.orderRepo.findById(trx, ctx.tenantId, orderId);
    if (!order) throw new NotFoundError('Order not found', { orderId });
    return this.repo.listByOrder(trx, ctx.tenantId, orderId);
  }
}
