import { Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import type { SearchIndexGateway } from '@ehr/search-adapter';
import { SEARCH_INDEX_GATEWAY } from '../search-index-gateway.token.js';
import {
  reindexPatients,
  reindexDocuments,
  reindexClaims,
  reindexNotes,
  reindexDiagnosticReports,
  reindexTasks,
  reindexReferrals,
  reindexPractitioners,
  reindexLocations,
} from './reindex.js';

@Controller('api/v1/search')
export class SearchController {
  constructor(@Inject(SEARCH_INDEX_GATEWAY) private readonly gateway: SearchIndexGateway) {}

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('search.query', 'SearchDocument')
  async search(@Query('q') q: string | undefined, @Req() req: FastifyRequest) {
    if (!q || q.trim().length === 0) {
      throw new ValidationError('Query parameter "q" is required');
    }
    const ctx = requireCtx(req);
    // No ABAC/consent tagging produces a non-empty context-tag list anywhere in this repo yet
    // (see README's Phase 7 scope decisions) — every authenticated staff caller can currently see
    // only untagged (sensitivityTags: []) documents, structurally ready for that to change later.
    return this.gateway.search(getCurrentTransaction(), { tenantId: ctx.tenantId, query: q, allowedContextTags: [] });
  }

  @Post('reindex')
  @RequirePermission(PERMISSION_KEYS.SEARCH_REINDEX)
  @Audited('search.reindex', 'SearchDocument')
  async reindex(@Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();
    // Sequential, not Promise.all — these share one transaction/connection, which cannot run
    // concurrent queries.
    const patients = await reindexPatients(trx, ctx.tenantId, this.gateway);
    const documents = await reindexDocuments(trx, ctx.tenantId, this.gateway);
    const claims = await reindexClaims(trx, ctx.tenantId, this.gateway);
    const notes = await reindexNotes(trx, ctx.tenantId, this.gateway);
    const diagnosticReports = await reindexDiagnosticReports(trx, ctx.tenantId, this.gateway);
    const tasks = await reindexTasks(trx, ctx.tenantId, this.gateway);
    const referrals = await reindexReferrals(trx, ctx.tenantId, this.gateway);
    const practitioners = await reindexPractitioners(trx, ctx.tenantId, this.gateway);
    const locations = await reindexLocations(trx, ctx.tenantId, this.gateway);
    return { patients, documents, claims, notes, diagnosticReports, tasks, referrals, practitioners, locations };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
