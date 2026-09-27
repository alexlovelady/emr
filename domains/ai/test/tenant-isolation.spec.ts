import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { NoopAiGateway } from '@ehr/ai-adapter';
import { CohortDslSchema, CohortService } from '@ehr/query';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { AiGenerationService } from '../src/generation/ai-generation.service.js';
import { toProvenance } from '../src/generation/ai-generation.repository.js';

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
