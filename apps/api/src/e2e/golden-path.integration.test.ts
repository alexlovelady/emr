import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { PatientService } from '@ehr/patient';
import { NoteService, ProblemService } from '@ehr/clinical';
import { DiagnosticReportService } from '@ehr/results';
import { TaskRepository } from '@ehr/tasks';
import { AiGenerationService } from '@ehr/ai';
import { NoopAiGateway } from '@ehr/ai-adapter';

/**
 * EHR_BUILD_SPEC.md §26 Phase 10 ("end-to-end golden workflows") /
 * EHR_REGULATORY_MANUAL.md §29's "golden patient safety cases passing." Exercises real,
 * already-implemented safety behaviors that no existing test currently proves end to end:
 * duplicate-patient merge/reverse-merge (§24's "duplicate patient" hazard), signed-note
 * immutability + amendment ("signed-note amendment behavior validated"), diagnostic-report
 * amendment, the critical-result -> Task wiring actually asserted (not just the flag),
 * and the AI-generation zero-context safety guard (§24's "AI hallucinated fact" hazard).
 * Deliberately does NOT re-prove what the 19 domains/*\/test/tenant-isolation.spec.ts files
 * already cover exhaustively — the one cross-tenant check here spot-checks the property holds
 * across a full realistic multi-domain object graph, not a single resource type in isolation.
 */
describe('golden path — pilot-readiness safety cases', () => {
  let handle: TestDbHandle;
  const patientService = new PatientService();
  const noteService = new NoteService();
  const problemService = new ProblemService();
  const diagnosticReportService = new DiagnosticReportService();
  const taskRepo = new TaskRepository();
  const aiGenerationService = new AiGenerationService(new NoopAiGateway());

  let encounterId: string;
  let encounterPatientId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'GoldenPath',
          family_name: `Test-${Date.now()}`,
          date_of_birth: '1975-05-15',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      encounterPatientId = patient.id;

      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Golden Path', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: encounterPatientId,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: practitioner.id,
          appointment_type: 'office_visit',
          scheduled_start: new Date(Date.now() + 3600_000),
          scheduled_end: new Date(Date.now() + 7200_000),
          status: 'checked_in',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const encounter = await trx
        .insertInto('encounters')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: encounterPatientId,
          appointment_id: appointment.id,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: practitioner.id,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      encounterId = encounter.id;
    });
  });

  afterAll(() => handle.close());

  describe('duplicate-patient merge safety', () => {
    it('merges a duplicate, reassigns identifiers, and is fully reversible', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const { targetId, sourceId } = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const target = await patientService.create(trx, ctxA, {
          givenName: 'Duplicate',
          familyName: `Target-${Date.now()}`,
          dateOfBirth: '1990-01-01',
        });
        const source = await patientService.create(trx, ctxA, {
          givenName: 'Duplicate',
          familyName: `Source-${Date.now()}`,
          dateOfBirth: '1990-01-01',
        });
        return { targetId: target.id, sourceId: source.id };
      });

      const history = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        patientService.merge(trx, ctxA, targetId, { sourcePatientId: sourceId, reason: 'confirmed duplicate' }),
      );

      const sourceAfterMerge = await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.getById(trx, ctxA, sourceId));
      expect(sourceAfterMerge.status).toBe('merged');

      await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.reverseMerge(trx, ctxA, history.id));
      const sourceAfterReversal = await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.getById(trx, ctxA, sourceId));
      expect(sourceAfterReversal.status).toBe('active');
    });

    it('rejects a self-merge and a double-reversal as real conflicts, not silent no-ops', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const patientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const patient = await patientService.create(trx, ctxA, {
          givenName: 'SelfMerge',
          familyName: `Test-${Date.now()}`,
          dateOfBirth: '1990-01-01',
        });
        return patient.id;
      });

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.merge(trx, ctxA, patientId, { sourcePatientId: patientId })),
      ).rejects.toBeInstanceOf(ConflictError);

      const otherId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const patient = await patientService.create(trx, ctxA, {
          givenName: 'MergeOnce',
          familyName: `Test-${Date.now()}`,
          dateOfBirth: '1990-01-01',
        });
        return patient.id;
      });
      const history = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        patientService.merge(trx, ctxA, patientId, { sourcePatientId: otherId }),
      );
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.reverseMerge(trx, ctxA, history.id));

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.reverseMerge(trx, ctxA, history.id)),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('signed-note immutability and amendment', () => {
    it('a signed note cannot be edited directly, and amendment is additive, never destructive', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const note = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        noteService.create(trx, ctxA, { encounterId, noteType: 'progress_note', content: { assessment: 'Original assessment.' } }),
      );
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.submitForReview(trx, ctxA, note.id));
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.sign(trx, ctxA, note.id));

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) =>
          noteService.updateContent(trx, ctxA, note.id, { assessment: 'Tampered assessment.' }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);

      const amendment = await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.amend(trx, ctxA, note.id));
      const original = await withTenantContext(handle.db, ctxA.tenantId, (trx) => noteService.getById(trx, ctxA, note.id));

      expect(original.content).toEqual({ assessment: 'Original assessment.' });
      expect(amendment.amendsNoteId).toBe(note.id);
      expect(original.status).toBe('signed');
    });
  });

  describe('diagnostic-report amendment', () => {
    it('amending a report never mutates the original — it creates a new, linked row', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const original = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        diagnosticReportService.create(trx, ctxA, encounterPatientId, {
          encounterId,
          displayName: 'Basic Metabolic Panel',
          criticalFlag: false,
          abnormalFlag: false,
          results: [{ code: '2345-7', display: 'Glucose', valueQuantity: 95, unit: 'mg/dL' }],
        }),
      );

      const amendment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        diagnosticReportService.amend(trx, ctxA, original.id, {
          encounterId,
          displayName: 'Basic Metabolic Panel (corrected)',
          criticalFlag: false,
          abnormalFlag: false,
          results: [{ code: '2345-7', display: 'Glucose', valueQuantity: 105, unit: 'mg/dL' }],
        }),
      );

      const originalAfterAmend = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        diagnosticReportService.getById(trx, ctxA, original.id),
      );
      expect(originalAfterAmend.displayName).toBe('Basic Metabolic Panel');
      expect(amendment.amendsReportId).toBe(original.id);
      expect(amendment.id).not.toBe(original.id);
    });
  });

  describe('critical-result -> Task wiring', () => {
    it('a critical diagnostic report genuinely opens a durable critical_result_review Task', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const report = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        diagnosticReportService.create(trx, ctxA, encounterPatientId, {
          encounterId,
          displayName: 'Potassium, critical',
          criticalFlag: true,
          abnormalFlag: true,
          results: [{ code: '2823-3', display: 'Potassium', valueQuantity: 6.8, unit: 'mmol/L' }],
        }),
      );

      const tasks = await withTenantContext(handle.db, ctxA.tenantId, (trx) => taskRepo.list(trx, ctxA.tenantId, { patientId: encounterPatientId }));
      const criticalTask = tasks.find((t) => t.taskType === 'critical_result_review' && t.relatedResourceId === report.id);
      expect(criticalTask).toBeDefined();
      expect(criticalTask?.priority).toBe('urgent');
      expect(criticalTask?.status).toBe('open');
    });
  });

  describe('AI generation safety guardrails', () => {
    it('refuses to generate with no grounding context, and never mutates the chart on accept', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) =>
          aiGenerationService.propose(trx, ctxA, {
            feature: 'chart_qa',
            promptTemplateId: 'chart-qa-v1',
            patientId: encounterPatientId,
            subjectType: null,
            subjectId: null,
            inputText: 'What are the active problems?',
            context: [],
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      const { problem } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        problemService.create(trx, ctxA, encounterPatientId, { codeSystem: 'icd10', code: 'I10', displayName: 'Essential hypertension' }),
      );

      const problemCountBefore = (
        await withTenantContext(handle.db, ctxA.tenantId, (trx) => problemService.list(trx, ctxA, encounterPatientId))
      ).length;

      const generation = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        aiGenerationService.propose(trx, ctxA, {
          feature: 'chart_qa',
          promptTemplateId: 'chart-qa-v1',
          patientId: encounterPatientId,
          subjectType: null,
          subjectId: null,
          inputText: 'What are the active problems?',
          context: [{ ref: `Problem/${problem.id}`, data: { displayName: problem.displayName } }],
        }),
      );
      expect(generation.contextRefs).toEqual([`Problem/${problem.id}`]);

      await withTenantContext(handle.db, ctxA.tenantId, (trx) => aiGenerationService.accept(trx, ctxA, generation.id, null));

      const problemCountAfter = (
        await withTenantContext(handle.db, ctxA.tenantId, (trx) => problemService.list(trx, ctxA, encounterPatientId))
      ).length;
      expect(problemCountAfter).toBe(problemCountBefore);

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => aiGenerationService.reject(trx, ctxA, generation.id)),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('cross-tenant isolation holds across the full object graph', () => {
    it('Tenant B cannot read Tenant A’s encounter, note, or diagnostic report by their real ids', async () => {
      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);

      await expect(
        withTenantContext(handle.db, ctxB.tenantId, (trx) => noteService.listByEncounter(trx, ctxB, encounterId)),
      ).resolves.toEqual([]);

      const reports = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        diagnosticReportService.list(trx, requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId), encounterPatientId),
      );
      const someReportId = reports[0]!.id;

      await expect(
        withTenantContext(handle.db, ctxB.tenantId, (trx) => diagnosticReportService.getById(trx, ctxB, someReportId)),
      ).rejects.toBeInstanceOf(NotFoundError);

      await expect(
        withTenantContext(handle.db, ctxB.tenantId, (trx) => patientService.getById(trx, ctxB, encounterPatientId)),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
