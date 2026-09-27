import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway } from '@ehr/ai-adapter';
import { CohortDslSchema, CohortService } from '@ehr/query';
import { OBJECT_STORAGE_GATEWAY } from '@ehr/documents';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { ProposeCohortDslSchema, ExecuteCohortDslSchema, type ProposeCohortDslInput, type ExecuteCohortDslInput } from './nl-to-cohort-dsl.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/**
 * EHR_BUILD_SPEC.md §8.4's exact flow: "LLM produces candidate DSL -> deterministic validator ->
 * show interpreted query -> authorization policy -> execute query -> return result." `propose()`
 * only ever persists the candidate; `executeCohort()` is the one place in this whole domain that
 * validates (via @ehr/query's existing, unmodified `CohortDslSchema`) and executes (via the
 * existing, unmodified `CohortService.execute()`) — the LLM never receives a database handle, and
 * `domains/ai` never constructs SQL itself.
 */
@Controller('api/v1/ai/cohort-dsl')
export class NlToCohortDslProposeController {
  private readonly service: AiGenerationService;

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.AI_GENERATION_MANAGE)
  @Audited('ai_generation.propose_cohort_dsl', 'AiGeneration')
  async propose(@Body(new ZodValidationPipe(ProposeCohortDslSchema)) body: ProposeCohortDslInput, @Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const row = await this.service.propose(trx, ctx, {
      feature: 'nl_to_cohort_dsl',
      promptTemplateId: 'nl-to-cohort-dsl-v1',
      patientId: null,
      subjectType: null,
      subjectId: null,
      inputText: body.question,
      context: [
        {
          ref: 'CohortDslSchema/v1',
          data: { grammar: 'field(age) | concept(condition|allergy|medication) | measure(latest_hba1c|days_since_completed_encounter)' },
        },
      ],
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

@Controller('api/v1/ai-generations/:id/execute-cohort')
export class NlToCohortDslExecuteController {
  private readonly aiGenerationService: AiGenerationService;
  private readonly cohortService: CohortService;

  constructor(@Inject(AI_GATEWAY) aiGateway: AiGateway, @Inject(OBJECT_STORAGE_GATEWAY) storageGateway: ObjectStorageGateway) {
    this.aiGenerationService = new AiGenerationService(aiGateway);
    this.cohortService = new CohortService(storageGateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('ai_generation.execute_cohort', 'CohortExecution')
  async execute(@Param('id') id: string, @Body(new ZodValidationPipe(ExecuteCohortDslSchema)) body: ExecuteCohortDslInput, @Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const generation = await this.aiGenerationService.getPendingById(trx, ctx, id);
    const candidate = body.editedDsl ?? generation.outputJson;
    const parsed = CohortDslSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new ValidationError('Invalid cohort DSL', { issues: parsed.error.issues });
    }

    const execution = await this.cohortService.execute(trx, ctx, null, parsed.data);
    const resolved = await this.aiGenerationService.acceptWithLinkedCohortExecution(
      trx,
      ctx,
      id,
      execution.id,
      body.editedDsl ? JSON.stringify(parsed.data) : null,
    );

    return { generation: { ...resolved, provenance: toProvenance(resolved) }, execution };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
