import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '../encounter/encounter.repository.js';
import { NoteTemplateRepository } from '../note-template/note-template.repository.js';
import type { CreateNoteInput } from './note.dto.js';
import { NoteRepository, type NoteRow } from './note.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const EDITABLE_STATUSES = ['draft', 'ready_for_review'];
const VOIDABLE_STATUSES = ['draft', 'ready_for_review'];

export interface NoteWithChain {
  note: NoteRow;
  amendments: NoteRow[];
}

/**
 * EHR_BUILD_SPEC.md §5.4's note lifecycle: DRAFT -> READY_FOR_REVIEW -> SIGNED -> AMENDED, with
 * VOIDED/ENTERED_IN_ERROR reachable only pre-sign. Amendment is additive, never destructive: `amend()`
 * inserts a brand-new draft note with `amendsNoteId` pointing at the note it corrects; the original
 * row's content and status are never written to again once signed.
 */
export class NoteService {
  constructor(
    private readonly repo: NoteRepository = new NoteRepository(),
    private readonly templateRepo: NoteTemplateRepository = new NoteTemplateRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateNoteInput): Promise<NoteRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, input.encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId: input.encounterId });

    let content = input.content ?? {};
    if (input.templateId) {
      const template = await this.templateRepo.findById(trx, ctx.tenantId, input.templateId);
      if (!template) throw new NotFoundError('Note template not found', { templateId: input.templateId });
      const seeded: Record<string, string> = {};
      for (const section of template.sections) {
        seeded[section.key] = section.defaultText ?? '';
      }
      content = { ...seeded, ...content };
    }

    const actorId = ctx.actor?.id ?? null;
    const note = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      encounterId: input.encounterId,
      patientId: encounter.patientId,
      templateId: input.templateId ?? null,
      noteType: input.noteType,
      content,
      amendsNoteId: null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, note, 'note.created.v1', {});
    return note;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<NoteRow> {
    const note = await this.repo.findById(trx, ctx.tenantId, id);
    if (!note) throw new NotFoundError('Note not found', { id });
    return note;
  }

  async getWithChain(trx: Executor, ctx: RequestContext, id: string): Promise<NoteWithChain> {
    const note = await this.getById(trx, ctx, id);
    const amendments: NoteRow[] = [];
    let cursorId = note.id;
    // Amendment chains are short in practice (a handful of corrections at most); walk forward
    // one hop at a time rather than a recursive CTE.
    for (let i = 0; i < 50; i += 1) {
      const next = await this.repo.listAmendmentChain(trx, ctx.tenantId, cursorId);
      if (next.length === 0) break;
      amendments.push(...next);
      cursorId = next[next.length - 1]!.id;
    }
    return { note, amendments };
  }

  async listByEncounter(trx: Executor, ctx: RequestContext, encounterId: string): Promise<NoteRow[]> {
    return this.repo.listByEncounter(trx, ctx.tenantId, encounterId);
  }

  /** Staff-facing counterpart to `@ehr/portal`'s chart read (Phase 8) — same underlying query, signed notes only. */
  async listSignedByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<NoteRow[]> {
    return this.repo.listSignedByPatient(trx, ctx.tenantId, patientId);
  }

  async updateContent(trx: Executor, ctx: RequestContext, id: string, content: Record<string, string>): Promise<NoteRow> {
    const current = await this.getById(trx, ctx, id);
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictError(`Note content cannot be edited once it is ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    return this.repo.updateContent(trx, ctx.tenantId, id, content, actorId ?? ctx.tenantId);
  }

  async submitForReview(trx: Executor, ctx: RequestContext, id: string): Promise<NoteRow> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'draft') {
      throw new ConflictError(`Cannot submit a note for review from status '${current.status}'`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, id, 'ready_for_review', {}, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'note.ready_for_review.v1', {});
    return updated;
  }

  async sign(trx: Executor, ctx: RequestContext, id: string): Promise<NoteRow> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'ready_for_review') {
      throw new ConflictError(`Cannot sign a note from status '${current.status}'`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const signedBy = actorId ?? ctx.tenantId;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, id, 'signed', { signed_at: new Date(), signed_by: signedBy }, signedBy);
    await this.emit(trx, ctx, updated, 'note.signed.v1', {});
    return updated;
  }

  async void(trx: Executor, ctx: RequestContext, id: string, reason: string): Promise<NoteRow> {
    const current = await this.getById(trx, ctx, id);
    if (!VOIDABLE_STATUSES.includes(current.status)) {
      throw new ConflictError('A signed note cannot be voided — use amend() to correct it instead', { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, id, 'voided', { void_reason: reason }, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'note.voided.v1', { reason });
    return updated;
  }

  /**
   * Creates a new draft note referencing `id` as the note it amends, seeded with the original's
   * content as a starting point. `id`'s own row is never written to — see class doc comment.
   */
  async amend(trx: Executor, ctx: RequestContext, id: string): Promise<NoteRow> {
    const original = await this.getById(trx, ctx, id);
    if (original.status !== 'signed') {
      throw new ConflictError('Only a signed note can be amended', { id, status: original.status });
    }

    const actorId = ctx.actor?.id ?? null;
    const amendment = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      encounterId: original.encounterId,
      patientId: original.patientId,
      templateId: original.templateId,
      noteType: original.noteType,
      content: { ...original.content },
      amendsNoteId: original.id,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, amendment, 'note.amended.v1', { amendsNoteId: original.id });
    return amendment;
  }

  private async emit(trx: Executor, ctx: RequestContext, note: NoteRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'note',
          aggregate_id: note.id,
          aggregate_version: note.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
