import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { CreateNoteTemplateInput } from './note-template.dto.js';
import { NoteTemplateRepository, type NoteTemplateRow } from './note-template.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class NoteTemplateService {
  constructor(private readonly repo: NoteTemplateRepository = new NoteTemplateRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateNoteTemplateInput): Promise<NoteTemplateRow> {
    const actorId = ctx.actor?.id ?? null;
    const template = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      name: input.name,
      sections: input.sections.map((section) => ({ ...section, defaultText: section.defaultText ?? null })),
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'note_template.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'note_template',
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

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<NoteTemplateRow> {
    const template = await this.repo.findById(trx, ctx.tenantId, id);
    if (!template) throw new NotFoundError('Note template not found', { id });
    return template;
  }

  async list(trx: Executor, ctx: RequestContext): Promise<NoteTemplateRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }
}
