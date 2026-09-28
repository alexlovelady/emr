import { Controller, Delete, Get, Header, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { withTenantContext, type DB } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import type { Env } from '@ehr/config';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { BulkExportJobRepository } from '@ehr/bulk-export';
import { DB_CONNECTION, ENV_CONFIG, OBJECT_STORAGE_GATEWAY } from '../common/tokens.js';
import { RequireScope } from '../common/require-scope.decorator.js';
import { requireFhirCtx } from '../fhir/require-fhir-context.js';
import { KickOffBulkExportQuerySchema, parseRequestedResourceTypes, type KickOffBulkExportQuery } from './bulk-export.dto.js';

/**
 * HL7 Bulk Data Access IG, system-level `$export` only (not `Group`/`Patient`-level — a real but
 * smaller cut, see `BulkExportRelay`'s own doc comment for the full scoping rationale). Kickoff
 * returns 202 immediately; the actual export runs out-of-process in `apps/worker`'s
 * `BulkExportRelay`, polling `bulk_export_jobs` — this controller only ever reads/writes that
 * table's rows, never does the export work itself.
 */
@Controller('fhir/r4')
export class BulkExportController {
  private readonly jobRepo = new BulkExportJobRepository();

  constructor(
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
    @Inject(OBJECT_STORAGE_GATEWAY) private readonly objectStorage: ObjectStorageGateway,
    @Inject(ENV_CONFIG) private readonly env: Env,
  ) {}

  @Get('$export')
  @RequireScope('system/*.read')
  async kickOff(@Query() rawQuery: Record<string, string>, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<void> {
    const ctx = requireFhirCtx(req);
    // Per the Bulk Data spec, a kickoff request without this header is invalid — the client must
    // opt into the async pattern rather than expecting a synchronous response.
    if (req.headers['prefer'] !== 'respond-async') {
      throw new ValidationError('A Prefer: respond-async header is required to kick off a bulk export');
    }

    const query: KickOffBulkExportQuery = KickOffBulkExportQuerySchema.parse(rawQuery);
    const resourceTypes = parseRequestedResourceTypes(query._type);

    const job = await withTenantContext(this.db, ctx.tenantId, (trx) =>
      this.jobRepo.create(trx, {
        tenantId: ctx.tenantId,
        requestedByClientId: ctx.clientId,
        resourceTypes,
        since: query._since ? new Date(query._since) : null,
      }),
    );

    res.status(202);
    res.header('Content-Location', `${this.fhirBaseUrl()}/bulkstatus/${job.id}`);
  }

  @Get('bulkstatus/:jobId')
  @RequireScope('system/*.read')
  @Header('Content-Type', 'application/json')
  async status(@Param('jobId') jobId: string, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<Record<string, unknown> | void> {
    const ctx = requireFhirCtx(req);
    const job = await this.getOwnJob(ctx.tenantId, ctx.clientId, jobId);

    if (job.status === 'pending' || job.status === 'in_progress') {
      res.status(202);
      res.header('X-Progress', job.status === 'pending' ? 'Queued' : 'In progress');
      return;
    }
    if (job.status === 'failed') {
      res.status(500);
      return {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: job.error || 'Export failed' }],
      };
    }

    const output = await Promise.all(
      (job.outputFiles ?? []).map(async (file) => ({
        type: file.type,
        url: await this.objectStorage.getDownloadUrl({ storageKey: file.storageKey }),
        count: file.count,
      })),
    );
    res.status(200);
    return {
      transactionTime: job.completedAt?.toISOString(),
      request: `${this.fhirBaseUrl()}/$export`,
      requiresAccessToken: true,
      output,
      error: [],
    };
  }

  @Delete('bulkstatus/:jobId')
  @RequireScope('system/*.read')
  async cancel(@Param('jobId') jobId: string, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<void> {
    const ctx = requireFhirCtx(req);
    const job = await this.getOwnJob(ctx.tenantId, ctx.clientId, jobId);
    if (job.status !== 'pending') {
      throw new ConflictError('Only a job that has not yet started can be cancelled', { jobId, status: job.status });
    }
    await withTenantContext(this.db, ctx.tenantId, (trx) => this.jobRepo.fail(trx, ctx.tenantId, jobId, 'Cancelled by client'));
    res.status(202);
  }

  private async getOwnJob(tenantId: string, clientId: string, jobId: string) {
    const job = await withTenantContext(this.db, tenantId, (trx) => this.jobRepo.findById(trx, tenantId, jobId));
    // Same posture as portal ConsentService: a job belonging to a different client in this same
    // tenant is indistinguishable from one that doesn't exist.
    if (!job || job.requestedByClientId !== clientId) throw new NotFoundError('Bulk export job not found', { jobId });
    return job;
  }

  private fhirBaseUrl(): string {
    return `http://localhost:${this.env.INTEROP_FHIR_PORT}/fhir/r4`;
  }
}
