import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { CreateTaskInput } from './task.dto.js';
import { TaskRepository, type TaskRow } from './task.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TERMINAL_STATUSES = ['completed', 'cancelled'];

export class TaskService {
  constructor(private readonly repo: TaskRepository = new TaskRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateTaskInput): Promise<TaskRow> {
    const actorId = ctx.actor?.id ?? null;
    const task = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: input.patientId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      assignedToRoleId: input.assignedToRoleId ?? null,
      taskType: input.taskType,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
      priority: input.priority,
      relatedResourceType: input.relatedResourceType ?? null,
      relatedResourceId: input.relatedResourceId ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, task, 'task.created.v1', { taskType: task.taskType, title: task.title });

    return task;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<TaskRow> {
    const task = await this.repo.findById(trx, ctx.tenantId, id);
    if (!task) throw new NotFoundError('Task not found', { id });
    return task;
  }

  async list(
    trx: Executor,
    ctx: RequestContext,
    filter: { patientId?: string; assignedToUserId?: string; status?: string } = {},
  ): Promise<TaskRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }

  async complete(trx: Executor, ctx: RequestContext, id: string): Promise<TaskRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertNotTerminal(current);
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, id, 'completed', { completed_at: new Date() }, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'task.completed.v1', {});
    return updated;
  }

  async cancel(trx: Executor, ctx: RequestContext, id: string): Promise<TaskRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertNotTerminal(current);
    const actorId = ctx.actor?.id ?? null;
    return this.repo.setStatus(trx, ctx.tenantId, id, 'cancelled', { cancelled_at: new Date() }, actorId ?? ctx.tenantId);
  }

  private assertNotTerminal(task: TaskRow): void {
    if (TERMINAL_STATUSES.includes(task.status)) {
      throw new ConflictError(`Task is already ${task.status}`, { id: task.id, status: task.status });
    }
  }

  private async emit(trx: Executor, ctx: RequestContext, task: TaskRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'task',
          aggregate_id: task.id,
          aggregate_version: task.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
