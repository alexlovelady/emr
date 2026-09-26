import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '@ehr/clinical';
import type { LabOrderGateway } from '@ehr/lab-adapter';
import type { CreateOrderInput } from './order.dto.js';
import { OrderRepository, type OrderRow } from './order.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TERMINAL_STATUSES = ['completed', 'cancelled', 'entered_in_error'];

export class OrderService {
  constructor(
    private readonly gateway: LabOrderGateway,
    private readonly repo: OrderRepository = new OrderRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateOrderInput): Promise<OrderRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, input.encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId: input.encounterId });

    const actorId = ctx.actor?.id ?? null;
    const order = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: encounter.patientId,
      encounterId: input.encounterId,
      orderingPractitionerId: input.orderingPractitionerId,
      orderType: input.orderType,
      codeSystem: input.codeSystem ?? null,
      code: input.code ?? null,
      displayName: input.displayName,
      priority: input.priority,
      createdBy: actorId ?? ctx.tenantId,
    });

    const submission = await this.gateway.submitOrder({
      orderId: order.id,
      orderType: order.orderType,
      codeSystem: order.codeSystem,
      code: order.code,
      displayName: order.displayName,
      priority: order.priority,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'order.placed.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'order',
          aggregate_id: order.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { orderType: order.orderType, placerOrderNumber: submission.placerOrderNumber },
        }),
      )
      .execute();

    return order;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<OrderRow> {
    const order = await this.repo.findById(trx, ctx.tenantId, id);
    if (!order) throw new NotFoundError('Order not found', { id });
    return order;
  }

  async list(trx: Executor, ctx: RequestContext, filter: { patientId?: string } = {}): Promise<OrderRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }

  async cancel(trx: Executor, ctx: RequestContext, id: string): Promise<OrderRow> {
    const current = await this.getById(trx, ctx, id);
    if (TERMINAL_STATUSES.includes(current.status)) {
      throw new ConflictError(`Order is already ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const cancelled = await this.repo.setStatus(trx, ctx.tenantId, id, 'cancelled', actorId ?? ctx.tenantId);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'order.cancelled.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'order',
          aggregate_id: cancelled.id,
          aggregate_version: cancelled.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: {},
        }),
      )
      .execute();

    return cancelled;
  }
}
