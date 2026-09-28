import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { EncounterService } from '../src/encounter/encounter.service.js';
import { NoteTemplateService } from '../src/note-template/note-template.service.js';
import { NoteService } from '../src/note/note.service.js';
import { ProblemService } from '../src/problem/problem.service.js';
import { AllergyService } from '../src/allergy/allergy.service.js';
import { ObservationService } from '../src/observation/observation.service.js';
import { ProcedureService } from '../src/procedure/procedure.service.js';
import { ExternalCandidateService } from '../src/external-candidate/external-candidate.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — clinical', () => {
  let handle: TestDbHandle;
  const encounterService = new EncounterService();
  const templateService = new NoteTemplateService();
  const noteService = new NoteService();
  const problemService = new ProblemService();
  const allergyService = new AllergyService();
  const observationService = new ObservationService();
  const externalCandidateService = new ExternalCandidateService();
  const procedureService = new ProcedureService();

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAAppointmentId: string;
  let tenantAEncounterId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Clinical-${Date.now()}`,
          date_of_birth: '1988-11-20',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    tenantAAppointmentId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({
          tenant_id: ctxA.tenantId,
          user_id: handle.seed.tenantA.adminUserId,
          organization_id: handle.seed.tenantA.organizationId,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({
          tenant_id: ctxA.tenantId,
          workforce_identity_id: workforceIdentity.id,
          display_name: 'Dr. Clinical Test',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      tenantAPractitionerId = practitioner.id;
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: tenantAPatientId,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: practitioner.id,
          appointment_type: 'office_visit',
          scheduled_start: new Date(Date.now() + 3600_000),
          scheduled_end: new Date(Date.now() + 7200_000),
          status: 'checked_in',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return appointment.id;
    });

    const encounter = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      encounterService.create(trx, ctxA, { appointmentId: tenantAAppointmentId, encounterType: 'office_visit' }),
    );
    tenantAEncounterId = encounter.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A encounter by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => encounterService.getById(trx, ctxB, tenantAEncounterId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('encounters').selectAll().where('id', '=', tenantAEncounterId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('enforces the explicit encounter state machine and requires a checked-in appointment', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => encounterService.sign(trx, ctxA, tenantAEncounterId)),
    ).rejects.toBeInstanceOf(ConflictError);

    const started = await withTenantContext(handle.db, ctxA.tenantId, (trx) => encounterService.start(trx, ctxA, tenantAEncounterId));
    expect(started.status).toBe('in_progress');
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => encounterService.document(trx, ctxA, tenantAEncounterId));

    // Encounter creation requires a checked-in appointment — a merely-scheduled one is rejected.
    const scheduledAppointment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: tenantAPatientId,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: tenantAPractitionerId,
          appointment_type: 'office_visit',
          scheduled_start: new Date(),
          scheduled_end: new Date(Date.now() + 1800_000),
          status: 'scheduled',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        encounterService.create(trx, ctxA, { appointmentId: scheduledAppointment.id, encounterType: 'office_visit' }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('note lifecycle: draft -> ready_for_review -> signed, additive amendment, and void-only-before-sign', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    const template = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      templateService.create(trx, ctxA, {
        name: `Progress Note ${Date.now()}`,
        sections: [{ key: 'assessment', label: 'Assessment', defaultText: '' }],
      }),
    );

    const note = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      noteService.create(trx, ctxA, { encounterId: tenantAEncounterId, templateId: template.id, noteType: 'progress_note' }),
    );
    expect(note.status).toBe('draft');

    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.sign(trx, ctxA, note.id)),
    ).rejects.toBeInstanceOf(ConflictError);

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      noteService.updateContent(trx, ctxA, note.id, { assessment: 'Stable, continue current plan.' }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.submitForReview(trx, ctxA, note.id));
    const signed = await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.sign(trx, ctxA, note.id));
    expect(signed.status).toBe('signed');

    // A signed note can never be voided.
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.void(trx, ctxA, note.id, 'test')),
    ).rejects.toBeInstanceOf(ConflictError);
    // ...nor have its content edited directly.
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.updateContent(trx, ctxA, note.id, { assessment: 'tampered' })),
    ).rejects.toBeInstanceOf(ConflictError);

    const amendment = await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.amend(trx, ctxA, note.id));
    expect(amendment.amendsNoteId).toBe(note.id);
    expect(amendment.status).toBe('draft');

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      noteService.updateContent(trx, ctxA, amendment.id, { assessment: 'Corrected: improving, reduce medication.' }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.submitForReview(trx, ctxA, amendment.id));
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.sign(trx, ctxA, amendment.id));

    const originalAfterAmendment = await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.getById(trx, ctxA, note.id));
    expect(originalAfterAmendment.content).toEqual({ assessment: 'Stable, continue current plan.' });
    expect(originalAfterAmendment.status).toBe('signed');

    const chain = await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.getWithChain(trx, ctxA, note.id));
    expect(chain.amendments).toHaveLength(1);
    expect(chain.amendments[0]!.id).toBe(amendment.id);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => noteService.getById(trx, ctxB, note.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('problem/allergy/observation/procedure are isolated per tenant', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);

    const { problem } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      problemService.create(trx, ctxA, tenantAPatientId, { codeSystem: 'ICD-10', code: 'I10', displayName: 'Essential hypertension' }),
    );
    const allergy = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      allergyService.create(trx, ctxA, tenantAPatientId, { substance: 'Penicillin', severity: 'moderate' }),
    );
    const observation = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      observationService.create(trx, ctxA, tenantAEncounterId, { category: 'vital-signs', code: 'heart-rate', displayName: 'Heart rate', valueQuantity: 72, unit: 'bpm' }),
    );
    const procedure = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      procedureService.create(trx, ctxA, tenantAEncounterId, { displayName: 'Influenza vaccination' }),
    );

    await expect(withTenantContext(handle.db, ctxB.tenantId, (trx) => problemService.getById(trx, ctxB, problem.id))).rejects.toBeInstanceOf(NotFoundError);
    await expect(withTenantContext(handle.db, ctxB.tenantId, (trx) => allergyService.getById(trx, ctxB, allergy.id))).rejects.toBeInstanceOf(NotFoundError);
    await expect(withTenantContext(handle.db, ctxB.tenantId, (trx) => observationService.getById(trx, ctxB, observation.id))).rejects.toBeInstanceOf(NotFoundError);
    await expect(withTenantContext(handle.db, ctxB.tenantId, (trx) => procedureService.getById(trx, ctxB, procedure.id))).rejects.toBeInstanceOf(NotFoundError);

    const rawProblems = await withTenantContext(handle.db, ctxB.tenantId, (trx) => trx.selectFrom('problems').selectAll().where('id', '=', problem.id).execute());
    expect(rawProblems).toHaveLength(0);
  });

  it('external-candidate reconciliation: import, accept, reject, and replace, isolated per tenant', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);

    const { problem: existingProblem } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      problemService.create(trx, ctxA, tenantAPatientId, { codeSystem: 'ICD-10', code: 'E11.9', displayName: 'Type 2 diabetes' }),
    );

    const candidates = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      externalCandidateService.import(trx, ctxA, tenantAPatientId, {
        originType: 'c-cda',
        sourceDocumentId: 'ccd-doc-1',
        items: [
          { resourceType: 'allergy', payload: { substance: 'Sulfa drugs', severity: 'moderate' } },
          { resourceType: 'problem', payload: { codeSystem: 'ICD-10', code: 'E11.9', displayName: 'Type 2 diabetes mellitus (updated)' } },
        ],
      }),
    );
    expect(candidates).toHaveLength(2);
    const [allergyCandidate, problemCandidate] = candidates;

    const accepted = await withTenantContext(handle.db, ctxA.tenantId, (trx) => externalCandidateService.accept(trx, ctxA, allergyCandidate!.id));
    expect(accepted.status).toBe('accepted');
    expect(accepted.createdResourceId).not.toBeNull();

    const rejected = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      externalCandidateService.reject(trx, ctxA, problemCandidate!.id),
    );
    expect(rejected.status).toBe('rejected');
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => externalCandidateService.accept(trx, ctxA, problemCandidate!.id)),
    ).rejects.toBeInstanceOf(ConflictError);

    const [replaceCandidate] = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      externalCandidateService.import(trx, ctxA, tenantAPatientId, {
        originType: 'fhir',
        sourceDocumentId: 'fhir-bundle-1',
        items: [{ resourceType: 'problem', payload: { codeSystem: 'ICD-10', code: 'E11.9', displayName: 'Type 2 diabetes (corrected)' } }],
      }),
    );
    const replaced = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      externalCandidateService.replace(trx, ctxA, replaceCandidate!.id, existingProblem.id),
    );
    expect(replaced.status).toBe('replaced');
    expect(replaced.replacesResourceId).toBe(existingProblem.id);

    const supersededProblem = await withTenantContext(handle.db, ctxA.tenantId, (trx) => problemService.getById(trx, ctxA, existingProblem.id));
    expect(supersededProblem.metadata).toMatchObject({ supersededByCandidateId: replaceCandidate!.id });

    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => externalCandidateService.getById(trx, ctxB, allergyCandidate!.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
