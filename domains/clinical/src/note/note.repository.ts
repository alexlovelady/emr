import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface NoteRow {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  templateId: string | null;
  noteType: string;
  content: Record<string, string>;
  amendsNoteId: string | null;
  signedAt: Date | null;
  signedBy: string | null;
  voidReason: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class NoteRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      encounterId: string;
      patientId: string;
      templateId: string | null;
      noteType: string;
      content: Record<string, string>;
      amendsNoteId: string | null;
      createdBy: string;
    },
  ): Promise<NoteRow> {
    const row = await trx
      .insertInto('notes')
      .values({
        tenant_id: input.tenantId,
        encounter_id: input.encounterId,
        patient_id: input.patientId,
        template_id: input.templateId,
        note_type: input.noteType,
        content: JSON.stringify(input.content),
        amends_note_id: input.amendsNoteId,
        status: 'draft',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<NoteRow | null> {
    const row = await trx
      .selectFrom('notes')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByEncounter(trx: Executor, tenantId: string, encounterId: string): Promise<NoteRow[]> {
    const rows = await trx
      .selectFrom('notes')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('encounter_id', '=', encounterId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  /** Portal-visible notes (`@ehr/portal`) — only fully signed notes, never drafts. */
  async listSignedByPatient(trx: Executor, tenantId: string, patientId: string): Promise<NoteRow[]> {
    const rows = await trx
      .selectFrom('notes')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .where('status', '=', 'signed')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  /** Walks the amendment chain forward from `originalNoteId` (each note that amends the previous one). */
  async listAmendmentChain(trx: Executor, tenantId: string, originalNoteId: string): Promise<NoteRow[]> {
    const rows = await trx
      .selectFrom('notes')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('amends_note_id', '=', originalNoteId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async updateContent(trx: Executor, tenantId: string, id: string, content: Record<string, string>, updatedBy: string): Promise<NoteRow> {
    const row = await trx
      .updateTable('notes')
      .set({ content: JSON.stringify(content), updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async setStatus(
    trx: Executor,
    tenantId: string,
    id: string,
    status: string,
    patch: Partial<{ signed_at: Date; signed_by: string; void_reason: string }>,
    updatedBy: string,
  ): Promise<NoteRow> {
    const row = await trx
      .updateTable('notes')
      .set({ ...patch, status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['notes']>): NoteRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    encounterId: dbRow.encounter_id,
    patientId: dbRow.patient_id,
    templateId: dbRow.template_id,
    noteType: dbRow.note_type,
    content: dbRow.content,
    amendsNoteId: dbRow.amends_note_id,
    signedAt: dbRow.signed_at,
    signedBy: dbRow.signed_by,
    voidReason: dbRow.void_reason,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
