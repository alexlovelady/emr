import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, RateLimitExceededError, ValidationError } from '@ehr/domain-common';
import { NoopAiGateway } from '@ehr/ai-adapter';
import { CohortDslSchema, CohortService } from '@ehr/query';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { DocumentRepository } from '@ehr/documents';
import type { TranscriptionGateway } from '@ehr/transcription-adapter';
import { NoopTranscriptionGateway } from '@ehr/transcription-adapter';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { AiGenerationService } from '../src/generation/ai-generation.service.js';
import { toProvenance } from '../src/generation/ai-generation.repository.js';
import { resolveAmbientAudioInput } from '../src/ambient-note-draft/resolve-ambient-audio.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — AI generations', () => {
  let handle: TestDbHandle;
  const service = new AiGenerationService(new NoopAiGateway());
  let tenantAGenerationId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    const row = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.propose(trx, ctxA, {
        feature: 'task_summary',
        promptTemplateId: 'task-summary-v1',
        patientId: null,
        subjectType: null,
        subjectId: null,
        inputText: 'summarize my open tasks',
        context: [{ ref: 'Task/seed-1', data: { status: 'open' } }],
      }),
    );
    tenantAGenerationId = row.id;
  });

  afterAll(() => handle.close());

  it('rejects a proposal with no grounding context', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        service.propose(trx, ctxA, {
          feature: 'task_summary',
          promptTemplateId: 'task-summary-v1',
          patientId: null,
          subjectType: null,
          subjectId: null,
          inputText: 'summarize',
          context: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('a proposal is readable and its provenance object matches the §15.4 shape while pending', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const row = await withTenantContext(handle.db, ctxA.tenantId, (trx) => service.getById(trx, ctxA, tenantAGenerationId));
    const provenance = toProvenance(row);
    expect(provenance.model_provider).toBe('noop');
    expect(provenance.source_refs).toEqual(['Task/seed-1']);
    expect(provenance.reviewer_id).toBeNull();
    expect(provenance.decision).toBe('pending');
  });

  it('Tenant B cannot read a Tenant A generation by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => service.getById(trx, ctxB, tenantAGenerationId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accepting with edits sets status accepted_with_edits and records the reviewer', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const row = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.accept(trx, ctxA, tenantAGenerationId, 'edited text'),
    );
    expect(row.status).toBe('accepted_with_edits');
    expect(row.reviewedBy).toBe(handle.seed.tenantA.adminUserId);
    expect(toProvenance(row).decision).toBe('accepted_with_edits');
  });

  it('resolving an already-resolved generation is a real conflict, not a silent no-op', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => service.reject(trx, ctxA, tenantAGenerationId)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('Tenant B cannot accept or reject a Tenant A generation by guessed UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => service.reject(trx, ctxB, tenantAGenerationId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/** Replicates NlToCohortDslExecuteController's exact logic without HTTP, per the Phase 9 plan's verification requirements. */
describe('NL-to-cohort-DSL execute integration', () => {
  let handle: TestDbHandle;
  const noopGateway: ObjectStorageGateway = {
    getUploadUrl: async () => ({ url: 'https://example.test/upload', storageKey: 'k' }),
    getDownloadUrl: async () => 'https://example.test/download',
    headObject: async () => null,
    putObject: async () => ({ storageKey: 'k' }),
  };
  const aiGenerationService = new AiGenerationService(new NoopAiGateway());
  const cohortService = new CohortService(noopGateway);

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  it('an invalid candidate DSL never reaches CohortService.execute() and creates no execution', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const generation = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      aiGenerationService.propose(trx, ctxA, {
        feature: 'nl_to_cohort_dsl',
        promptTemplateId: 'nl-to-cohort-dsl-v1',
        patientId: null,
        subjectType: null,
        subjectId: null,
        inputText: 'a garbage question',
        context: [{ ref: 'CohortDslSchema/v1', data: { grammar: 'field|concept|measure' } }],
      }),
    );

    const invalidCandidate = { version: 1, entity: 'patient', where: { all: [{ field: 'not_a_real_field', op: 'eq', value: 1 }] } };
    const parsed = CohortDslSchema.safeParse(invalidCandidate);
    expect(parsed.success).toBe(false);

    const before = await withTenantContext(handle.db, ctxA.tenantId, (trx) => aiGenerationService.getById(trx, ctxA, generation.id));
    expect(before.status).toBe('pending');
    expect(before.linkedCohortExecutionId).toBeNull();
  });

  it('a valid candidate DSL executes for real and links the cohort_execution back onto the generation', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const generation = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      aiGenerationService.propose(trx, ctxA, {
        feature: 'nl_to_cohort_dsl',
        promptTemplateId: 'nl-to-cohort-dsl-v1',
        patientId: null,
        subjectType: null,
        subjectId: null,
        inputText: 'patients age 45 to 75',
        context: [{ ref: 'CohortDslSchema/v1', data: { grammar: 'field|concept|measure' } }],
      }),
    );

    const validCandidate = generation.outputJson;
    const parsed = CohortDslSchema.safeParse(validCandidate);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('expected valid candidate DSL');

    const execution = await withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.execute(trx, ctxA, null, parsed.data));
    const resolved = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      aiGenerationService.acceptWithLinkedCohortExecution(trx, ctxA, generation.id, execution.id, null),
    );

    expect(resolved.status).toBe('accepted');
    expect(resolved.linkedCohortExecutionId).toBe(execution.id);
  });

  it('Tenant B cannot execute against a Tenant A pending generation', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const generation = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      aiGenerationService.propose(trx, ctxA, {
        feature: 'nl_to_cohort_dsl',
        promptTemplateId: 'nl-to-cohort-dsl-v1',
        patientId: null,
        subjectType: null,
        subjectId: null,
        inputText: 'another question',
        context: [{ ref: 'CohortDslSchema/v1', data: { grammar: 'field|concept|measure' } }],
      }),
    );

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => aiGenerationService.getPendingById(trx, ctxB, generation.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/** Tier 2 platform gap: a real (audio-based) ambient scribe, layered onto the existing text-prompt
 * `ambient_note_draft` feature. No real speech-to-text vendor is connected — `NoopTranscriptionGateway`
 * always reports `available: false`, so this asserts the honest-failure path, not a fabricated one. */
describe('resolveAmbientAudioInput (real ambient-scribe path)', () => {
  let handle: TestDbHandle;
  const documentRepo = new DocumentRepository();
  let tenantAEncounterId: string;
  let storedAudioDocumentId: string;
  let pendingAudioDocumentId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    const patientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Scribe',
          family_name: `Test-${Date.now()}`,
          date_of_birth: '1990-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    tenantAEncounterId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Scribe Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: patientId,
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
          patient_id: patientId,
          appointment_id: appointment.id,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: practitioner.id,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return encounter.id;
    });

    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const pending = await documentRepo.create(trx, {
        tenantId: ctxA.tenantId,
        filename: 'visit-audio-pending.webm',
        contentType: 'audio/webm',
        storageKey: `ambient-audio-test/${runId}-pending`,
        patientId,
        encounterId: tenantAEncounterId,
        documentCategory: 'ambient_audio',
        createdBy: ctxA.actor!.id,
      });
      pendingAudioDocumentId = pending.id;

      const stored = await documentRepo.create(trx, {
        tenantId: ctxA.tenantId,
        filename: 'visit-audio-stored.webm',
        contentType: 'audio/webm',
        storageKey: `ambient-audio-test/${runId}-stored`,
        patientId,
        encounterId: tenantAEncounterId,
        documentCategory: 'ambient_audio',
        createdBy: ctxA.actor!.id,
      });
      await documentRepo.markStored(trx, ctxA.tenantId, stored.id, 12345);
      storedAudioDocumentId = stored.id;
    });
  });

  afterAll(() => handle.close());

  it('rejects an audio document that has not finished uploading', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        resolveAmbientAudioInput(trx, ctxA.tenantId, tenantAEncounterId, pendingAudioDocumentId, new NoopTranscriptionGateway(), documentRepo),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects an audio document that does not belong to this encounter', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        resolveAmbientAudioInput(trx, ctxA.tenantId, 'not-a-real-encounter-id', storedAudioDocumentId, new NoopTranscriptionGateway(), documentRepo),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('with the Noop gateway (no real speech-to-text vendor), a stored recording still 409s rather than fabricating a transcript', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        resolveAmbientAudioInput(trx, ctxA.tenantId, tenantAEncounterId, storedAudioDocumentId, new NoopTranscriptionGateway(), documentRepo),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('a real (stubbed-here) transcription gateway result flows through as the input text', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const fakeRealGateway: TranscriptionGateway = {
      transcribeAudio: async () => ({ transcript: 'Patient reports improved symptoms since last visit.', confidence: 0.94, available: true }),
    };
    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      resolveAmbientAudioInput(trx, ctxA.tenantId, tenantAEncounterId, storedAudioDocumentId, fakeRealGateway, documentRepo),
    );
    expect(result.inputText).toBe('Patient reports improved symptoms since last visit.');
    expect(result.contextItems).toHaveLength(1);
    expect(result.contextItems[0]!.ref).toBe(`Document/${storedAudioDocumentId}`);
  });
});

/**
 * This dev DB is shared and never reset, so `ai_rate_limit_counters` accumulates one row per
 * (tenant, calendar day) across every test run today — a fixed literal limit like "3" would break
 * the moment this file (or anything else hitting tenant B's AiGenerationService today) runs twice
 * in one day. Reads today's actual baseline count first and sets the limit relative to it, the same
 * "make the assertion relative, not absolute" fix this session used for other shared-DB tests.
 */
describe('AI generation daily rate limit (persisted, cross-instance-safe)', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  async function todaysCount(tenantId: string): Promise<number> {
    const ctx = requestContextFor(tenantId, handle.seed.tenantB.adminUserId);
    const todayUtc = new Date().toISOString().slice(0, 10);
    const row = await withTenantContext(handle.db, ctx.tenantId, (trx) =>
      trx.selectFrom('ai_rate_limit_counters').select('count').where('tenant_id', '=', tenantId).where('window_date', '=', todayUtc).executeTakeFirst(),
    );
    return row?.count ?? 0;
  }

  function proposeInput(marker: string) {
    return {
      feature: 'task_summary' as const,
      promptTemplateId: 'task-summary-v1' as const,
      patientId: null,
      subjectType: null,
      subjectId: null,
      inputText: `rate limit test ${marker}`,
      context: [{ ref: 'Task/rate-limit-test', data: { status: 'open' } }],
    };
  }

  it('enforces a real per-tenant daily cap that persists across separate service instances', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const baseline = await todaysCount(handle.seed.tenantB.tenantId);
    // Two separate AiGenerationService instances (standing in for two separate `apps/api`
    // processes) sharing nothing but the database — proves the counter isn't in-process memory.
    const serviceInstanceOne = new AiGenerationService(new NoopAiGateway(), undefined, undefined, baseline + 2);
    const serviceInstanceTwo = new AiGenerationService(new NoopAiGateway(), undefined, undefined, baseline + 2);

    await withTenantContext(handle.db, ctxB.tenantId, (trx) => serviceInstanceOne.propose(trx, ctxB, proposeInput('one')));
    await withTenantContext(handle.db, ctxB.tenantId, (trx) => serviceInstanceTwo.propose(trx, ctxB, proposeInput('two')));

    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => serviceInstanceOne.propose(trx, ctxB, proposeInput('three'))),
    ).rejects.toBeInstanceOf(RateLimitExceededError);

    // The rejected attempt's own increment rolls back with the rest of its transaction (same as
    // any other failure inside a `trx`-wrapped call in this codebase) — the persisted count stays
    // exactly at the limit rather than climbing past it on every retry, while still correctly
    // rejecting every subsequent attempt (it re-reads the same at-limit count each time).
    expect(await todaysCount(handle.seed.tenantB.tenantId)).toBe(baseline + 2);
  });

  it("does not count a rejected (never-succeeded) generation against a different tenant's quota", async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const baselineA = await todaysCount(handle.seed.tenantA.tenantId);
    const service = new AiGenerationService(new NoopAiGateway());
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => service.propose(trx, ctxA, proposeInput('isolation')));
    expect(await todaysCount(handle.seed.tenantA.tenantId)).toBe(baselineA + 1);

    // Tenant B's own baseline (read in the previous test) must be unaffected by tenant A activity.
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const countB = await todaysCount(handle.seed.tenantB.tenantId);
    const beforeCrossTenantAttempt = countB;
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => service.getById(trx, ctxB, '00000000-0000-0000-0000-000000000000')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await todaysCount(handle.seed.tenantB.tenantId)).toBe(beforeCrossTenantAttempt);
  });
});
