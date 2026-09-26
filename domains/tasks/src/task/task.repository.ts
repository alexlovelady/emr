import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface TaskRow {
  id: string;
  tenantId: string;
  patientId: string | null;
  assignedToUserId: string | null;
  assignedToRoleId: string | null;
  taskType: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  priority: string;
  relatedResourceType: string | null;
  relatedResourceId: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class TaskRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string | null;
      assignedToUserId: string | null;
      assignedToRoleId: string | null;
      taskType: string;
      title: string;
      description: string | null;
      dueAt: Date | null;
      priority: string;
      relatedResourceType: string | null;
      relatedResourceId: string | null;
      createdBy: string;
    },
  ): Promise<TaskRow> {
    const row = await trx
      .insertInto('tasks')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        assigned_to_user_id: input.assignedToUserId,
        assigned_to_role_id: input.assignedToRoleId,
        task_type: input.taskType,
        title: input.title,
        description: input.description,
        due_at: input.dueAt,
        priority: input.priority,
        related_resource_type: input.relatedResourceType,
        related_resource_id: input.relatedResourceId,
        status: 'open',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<TaskRow | null> {
    const row = await trx
      .selectFrom('tasks')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(
    trx: Executor,
    tenantId: string,
    filter: { patientId?: string; assignedToUserId?: string; status?: string } = {},
  ): Promise<TaskRow[]> {
    let query = trx.selectFrom('tasks').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) query = query.where('patient_id', '=', filter.patientId);
    if (filter.assignedToUserId) query = query.where('assigned_to_user_id', '=', filter.assignedToUserId);
    if (filter.status) query = query.where('status', '=', filter.status);
    const rows = await query.orderBy('created_at', 'desc').execute();
    return rows.map(toRow);
  }

  async setStatus(
    trx: Executor,
    tenantId: string,
    id: string,
    status: string,
    patch: Partial<{ completed_at: Date; cancelled_at: Date }>,
    updatedBy: string,
  ): Promise<TaskRow> {
    const row = await trx
      .updateTable('tasks')
      .set({ ...patch, status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['tasks']>): TaskRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    assignedToUserId: dbRow.assigned_to_user_id,
    assignedToRoleId: dbRow.assigned_to_role_id,
    taskType: dbRow.task_type,
    title: dbRow.title,
    description: dbRow.description,
    dueAt: dbRow.due_at,
    priority: dbRow.priority,
    relatedResourceType: dbRow.related_resource_type,
    relatedResourceId: dbRow.related_resource_id,
    completedAt: dbRow.completed_at,
    cancelledAt: dbRow.cancelled_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
