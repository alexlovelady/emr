import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '../encounter/encounter.repository.js';
import { NoteTemplateRepository } from '../note-template/note-template.repository.js';
import type { CreateNoteInput } from './note.dto.js';
import { NoteRepository, type NoteRow, type NoteSectionMeta } from './note.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const EDITABLE_STATUSES = ['draft', 'ready_for_review'];
const VOIDABLE_STATUSES = ['draft', 'ready_for_review'];

export interface NoteWithChain {
  note: NoteRow;
  amendments: NoteRow[];
}

/** One `NoteSectionMeta` entry per key of `content`, all with the same `source` — what a note's
 * `content` map looks like the moment it first gets that source (freshly created from a template,
 * freshly copied forward, or freshly typed by a clinician at creation time). */
function initialSectionMetadata(content: Record<string, string>, source: NoteSectionMeta['source'], copiedFromNoteId?: string): Record<string, NoteSectionMeta> {
  const now = new Date().toISOString();
  const metadata: Record<string, NoteSectionMeta> = {};
  for (const key of Object.keys(content)) {
    metadata[key] = { source, lastTouchedAt: now, ...(copiedFromNoteId ? { copiedFromNoteId } : {}) };
  }
  return metadata;
}

/**
 * `updateContent()` always receives the WHOLE content map (the DTO requires every key, matching a
 * typical full-form save), not a partial patch — so a key can't be assumed "edited" just because
 * it's present in the payload; it has to have actually CHANGED value compared to what's currently
 * stored. A key resent with its unchanged value (the clinician never touched that section this
 * save) keeps its prior metadata entry untouched — still 'template_default'/'copied_forward' if it
 * started that way, still stale.
 */
function diffSectionMetadata(
  priorContent: Record<string, string>,
  priorMetadata: Record<string, NoteSectionMeta>,
  newContent: Record<string, string>,
): Record<string, NoteSectionMeta> {
  const now = new Date().toISOString();
  const metadata: Record<string, NoteSectionMeta> = { ...priorMetadata };
  for (const [key, value] of Object.entries(newContent)) {
    if (priorContent[key] !== value) {
      metadata[key] = { source: 'edited', lastTouchedAt: now };
    }
  }
  return metadata;
}

/** Section keys never actually reviewed/edited by the signing clinician — still exactly as a
 * template default or a copy-forward left them. Returned as a non-blocking warning (same "warn,
 * don't hard-block" posture as this codebase's other honest safety checks), never prevents signing. */
export function staleSectionKeys(metadata: Record<string, NoteSectionMeta>): string[] {
  return Object.entries(metadata)
    .filter(([, meta]) => meta.source !== 'edited')
    .map(([key]) => key);
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

    const callerContent = input.content ?? {};
    let content = callerContent;
    if (input.templateId) {
      const template = await this.templateRepo.findById(trx, ctx.tenantId, input.templateId);
      if (!template) throw new NotFoundError('Note template not found', { templateId: input.templateId });
      const seeded: Record<string, string> = {};
      for (const section of template.sections) {
        seeded[section.key] = section.defaultText ?? '';
      }
      content = { ...seeded, ...callerContent };
    }

    // A key the caller explicitly supplied at creation is 'edited' (the clinician typed it right
    // now); a key that only exists because a template default seeded it is 'template_default' —
    // untouched until a later updateContent() actually changes its value.
    const sectionMetadata: Record<string, NoteSectionMeta> = {};
    const now = new Date().toISOString();
    for (const key of Object.keys(content)) {
      sectionMetadata[key] = Object.hasOwn(callerContent, key) ? { source: 'edited', lastTouchedAt: now } : { source: 'template_default', lastTouchedAt: now };
    }

    const actorId = ctx.actor?.id ?? null;
    const note = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      encounterId: input.encounterId,
      patientId: encounter.patientId,
      templateId: input.templateId ?? null,
      noteType: input.noteType,
      content,
      sectionMetadata,
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
    const sectionMetadata = diffSectionMetadata(current.content, current.sectionMetadata, content);
    const actorId = ctx.actor?.id ?? null;
    return this.repo.updateContent(trx, ctx.tenantId, id, content, sectionMetadata, actorId ?? ctx.tenantId);
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

  /**
   * `staleSections` (item 19) is non-blocking — a note with sections still exactly as a template
   * default or a copy-forward left them CAN be signed; the caller/UI is expected to show the
   * warning, not treat it as a rejection. See `staleSectionKeys`'s doc comment for why this can
   * never be a hard block: real clinical workflows routinely sign notes where an unchanged section
   * (e.g. "no relevant family history") is correct as-is.
   */
  async sign(trx: Executor, ctx: RequestContext, id: string): Promise<{ note: NoteRow; staleSections: string[] }> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'ready_for_review') {
      throw new ConflictError(`Cannot sign a note from status '${current.status}'`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const signedBy = actorId ?? ctx.tenantId;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, id, 'signed', { signed_at: new Date(), signed_by: signedBy }, signedBy);
    await this.emit(trx, ctx, updated, 'note.signed.v1', {});
    return { note: updated, staleSections: staleSectionKeys(updated.sectionMetadata) };
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
   * content as a starting point. `id`'s own row is never written to — see class doc comment. Every
   * copied section starts 'copied_forward' (item 19) — an amendment that's signed without actually
   * correcting anything defeats its own purpose, so this is exactly the case `staleSectionKeys`
   * should flag at `sign()` time.
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
      sectionMetadata: initialSectionMetadata(original.content, 'copied_forward', original.id),
      amendsNoteId: original.id,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, amendment, 'note.amended.v1', { amendsNoteId: original.id });
    return amendment;
  }

  /**
   * Item 19's literal "copy forward" gap: unlike `amend()` (which corrects the SAME encounter's
   * already-signed note), this seeds a brand-new note for a DIFFERENT (typically later) encounter
   * from an unrelated prior note's content — the everyday "start today's note from last visit's"
   * workflow. `priorNoteId` need not be signed (a common real pattern is copying forward from the
   * patient's most recent note regardless of its status), but must belong to the same patient —
   * copying another patient's note content into this one would be a real safety/privacy bug, not
   * just a data-quality one.
   */
  async createFromPrior(trx: Executor, ctx: RequestContext, encounterId: string, priorNoteId: string, noteType: string): Promise<NoteRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });

    const prior = await this.getById(trx, ctx, priorNoteId);
    if (prior.patientId !== encounter.patientId) {
      throw new ConflictError('Cannot copy a note forward from a different patient', { priorNoteId, encounterId });
    }

    const actorId = ctx.actor?.id ?? null;
    const note = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      encounterId,
      patientId: encounter.patientId,
      templateId: prior.templateId,
      noteType,
      content: { ...prior.content },
      sectionMetadata: initialSectionMetadata(prior.content, 'copied_forward', prior.id),
      amendsNoteId: null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, note, 'note.created.v1', { copiedFromNoteId: prior.id });
    return note;
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
