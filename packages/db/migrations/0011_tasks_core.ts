import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Generic work-item table backing front-desk/clinician/billing queues across every later phase.
 * `related_resource_type`/`related_resource_id` is a deliberate polymorphic reference (no FK) —
 * tasks need to point at appointments, intake responses, or (in later phases) clinical resources
 * that don't all exist yet, and a single tasks table shouldn't grow a new nullable FK column per
 * resource type it might someday reference.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('tasks'))
    .addColumn('patient_id', 'uuid')
    .addColumn('assigned_to_user_id', 'uuid')
    .addColumn('assigned_to_role_id', 'uuid')
    .addColumn('task_type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('due_at', 'timestamptz')
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('normal'))
    .addColumn('related_resource_type', 'text')
    .addColumn('related_resource_id', 'uuid')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('cancelled_at', 'timestamptz')
    .addForeignKeyConstraint('tasks_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('tasks_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('tasks_assigned_user_fk', ['assigned_to_user_id'], 'users', ['id'])
    .addForeignKeyConstraint('tasks_assigned_role_fk', ['assigned_to_role_id'], 'roles', ['id'])
    .addCheckConstraint('tasks_priority_check', sql`priority in ('low', 'normal', 'high', 'urgent')`)
    .execute();
  await sql`create index tasks_tenant_idx on tasks (tenant_id)`.execute(db);
  await sql`create index tasks_patient_idx on tasks (patient_id)`.execute(db);
  await sql`create index tasks_assigned_user_idx on tasks (assigned_to_user_id)`.execute(db);
  await sql`create index tasks_related_resource_idx on tasks (related_resource_type, related_resource_id)`.execute(db);
  await enableTenantIsolation(db, 'tasks');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tasks').ifExists().execute();
}
