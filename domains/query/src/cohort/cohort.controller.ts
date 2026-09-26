import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { OBJECT_STORAGE_GATEWAY } from '@ehr/documents';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import {
  SaveCohortSchema,
  ExecuteAdHocCohortSchema,
  CohortDslSchema,
  type SaveCohortInput,
  type ExecuteAdHocCohortInput,
} from './cohort.dto.js';
import { CohortService } from './cohort.service.js';

@Controller('api/v1/cohorts')
export class CohortController {
  private readonly service: CohortService;

  constructor(@Inject(OBJECT_STORAGE_GATEWAY) gateway: ObjectStorageGateway) {
    this.service = new CohortService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.COHORT_MANAGE)
  @Audited('cohort.create', 'Cohort')
  async create(@Body(new ZodValidationPipe(SaveCohortSchema)) body: SaveCohortInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.COHORT_MANAGE)
  @Audited('cohort.list', 'Cohort')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }

  @Post('execute')
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('cohort.execute_ad_hoc', 'CohortExecution')
  async executeAdHoc(@Body(new ZodValidationPipe(ExecuteAdHocCohortSchema)) body: ExecuteAdHocCohortInput, @Req() req: FastifyRequest) {
    return this.service.execute(getCurrentTransaction(), requireCtx(req), null, body.dsl);
  }
}

@Controller('api/v1/cohorts/:id')
export class CohortDetailController {
  private readonly service: CohortService;

  constructor(@Inject(OBJECT_STORAGE_GATEWAY) gateway: ObjectStorageGateway) {
    this.service = new CohortService(gateway);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.COHORT_MANAGE)
  @Audited('cohort.read', 'Cohort')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post('execute')
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('cohort.execute', 'CohortExecution')
  async execute(@Param('id') id: string, @Req() req: FastifyRequest) {
    const cohort = await this.service.getById(getCurrentTransaction(), requireCtx(req), id);
    const dsl = CohortDslSchema.parse(cohort.dslPayload);
    return this.service.execute(getCurrentTransaction(), requireCtx(req), id, dsl);
  }

  @Get('executions')
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('cohort.list_executions', 'CohortExecution')
  async listExecutions(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.listExecutions(getCurrentTransaction(), requireCtx(req), id);
  }
}

@Controller('api/v1/cohort-executions/:id')
export class CohortExecutionController {
  private readonly service: CohortService;

  constructor(@Inject(OBJECT_STORAGE_GATEWAY) gateway: ObjectStorageGateway) {
    this.service = new CohortService(gateway);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('cohort_execution.read', 'CohortExecution')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getExecutionById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post('export')
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('cohort_execution.export', 'CohortExecution')
  async export(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.exportExecution(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
