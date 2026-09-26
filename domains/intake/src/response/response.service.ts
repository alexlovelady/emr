import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { IntakeFormTemplateRepository } from '../template/template.repository.js';
import type { CreateIntakeFormResponseInput } from './response.dto.js';
import { IntakeFormResponseRepository, type IntakeFormResponseRow } from './response.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class IntakeFormResponseService {
  constructor(
    private readonly repo: IntakeFormResponseRepository = new IntakeFormResponseRepository(),
    private readonly templateRepo: IntakeFormTemplateRepository = new IntakeFormTemplateRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateIntakeFormResponseInput): Promise<IntakeFormResponseRow> {
    const template = await this.templateRepo.findById(trx, ctx.tenantId, input.templateId);
    if (!template) throw new NotFoundError('Intake form template not found', { templateId: input.templateId });

    const actorId = ctx.actor?.id ?? null;
    const response = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      templateId: input.templateId,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'intake_form_response.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'intake_form_response',
          aggregate_id: response.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { templateId: response.templateId, patientId: response.patientId },
        }),
      )
      .execute();

    return response;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<IntakeFormResponseRow> {
    const response = await this.repo.findById(trx, ctx.tenantId, id);
    if (!response) throw new NotFoundError('Intake form response not found', { id });
    return response;
  }

  async list(trx: Executor, ctx: RequestContext, filter: { patientId?: string } = {}): Promise<IntakeFormResponseRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }

  async submit(trx: Executor, ctx: RequestContext, id: string, answers: Record<string, unknown>): Promise<IntakeFormResponseRow> {
    const response = await this.getById(trx, ctx, id);
    if (response.status !== 'draft') {
      throw new ConflictError('Intake form response has already been submitted', { id, status: response.status });
    }

    const template = await this.templateRepo.findById(trx, ctx.tenantId, response.templateId);
    if (!template) throw new NotFoundError('Intake form template not found', { templateId: response.templateId });

    const missing = template.schema.filter((field) => field.required && isBlank(answers[field.key])).map((field) => field.key);
    if (missing.length > 0) {
      throw new ValidationError('Missing required intake fields', { missing });
    }

    const actorId = ctx.actor?.id ?? null;
    const submitted = await this.repo.submit(trx, ctx.tenantId, id, answers, actorId ?? ctx.tenantId);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'intake_form.submitted.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'intake_form_response',
          aggregate_id: submitted.id,
          aggregate_version: submitted.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { templateId: submitted.templateId, patientId: submitted.patientId },
        }),
      )
      .execute();

    return submitted;
  }
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
