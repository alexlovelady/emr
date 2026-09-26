import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { CreateIntakeFormTemplateInput } from './template.dto.js';
import { IntakeFormTemplateRepository, type IntakeFormTemplateRow } from './template.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class IntakeFormTemplateService {
  constructor(private readonly repo: IntakeFormTemplateRepository = new IntakeFormTemplateRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateIntakeFormTemplateInput): Promise<IntakeFormTemplateRow> {
    const actorId = ctx.actor?.id ?? null;
    const template = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      name: input.name,
      schema: input.schema.map((field) => ({ ...field, options: field.options ?? null })),
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'intake_form_template.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'intake_form_template',
          aggregate_id: template.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { name: template.name },
        }),
      )
      .execute();

    return template;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<IntakeFormTemplateRow> {
    const template = await this.repo.findById(trx, ctx.tenantId, id);
    if (!template) throw new NotFoundError('Intake form template not found', { id });
    return template;
  }

  async list(trx: Executor, ctx: RequestContext): Promise<IntakeFormTemplateRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }
}
