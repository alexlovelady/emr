import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { GOVERNED_QUERIES } from './governed-query.registry.js';

@Controller('api/v1/governed-queries')
export class GovernedQueryController {
  @Get()
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('governed_query.list', 'GovernedQuery')
  list() {
    return Object.entries(GOVERNED_QUERIES).map(([name, def]) => ({ name, description: def.description }));
  }

  @Post(':name/execute')
  @RequirePermission(PERMISSION_KEYS.REPORT_QUERY_POPULATION)
  @Audited('governed_query.execute', 'GovernedQuery')
  async execute(@Param('name') name: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    const definition = GOVERNED_QUERIES[name];
    if (!definition) throw new NotFoundException(`Unknown governed query: ${name}`);

    const parsed = definition.paramsSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid governed query parameters', { issues: parsed.error.issues });
    }

    const ctx = requireCtx(req);
    return definition.run(getCurrentTransaction(), ctx.tenantId, parsed.data as Record<string, unknown>);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
