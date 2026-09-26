import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import type { RequestUploadInput } from './document.dto.js';
import { DocumentRepository, type DocumentRow } from './document.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface RequestUploadResult {
  document: DocumentRow;
  uploadUrl: string;
}

/**
 * Thin by design (see EHR_BUILD_SPEC.md §9/§16 and this repo's Phase 1 plan) — proves the
 * authz+audit+outbox+object-storage pattern end to end rather than delivering the real
 * DocumentReference lifecycle (Phase 3+). Notably NOT implemented yet: malware scanning, MIME
 * sniffing, size limits, checksum verification (spec §16) — confirmUpload() trusts the
 * content-length S3/MinIO reports rather than independently verifying the object. Close these
 * before any real document ever passes through this path.
 */
export class DocumentService {
  constructor(
    private readonly gateway: ObjectStorageGateway,
    private readonly repo: DocumentRepository = new DocumentRepository(),
  ) {}

  async requestUpload(trx: Executor, ctx: RequestContext, input: RequestUploadInput): Promise<RequestUploadResult> {
    const { url, storageKey } = await this.gateway.getUploadUrl({
      tenantId: ctx.tenantId,
      filename: input.filename,
      contentType: input.contentType,
    });

    const actorId = ctx.actor?.id ?? null;
    const document = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      filename: input.filename,
      contentType: input.contentType,
      storageKey,
      patientId: input.patientId ?? null,
      encounterId: input.encounterId ?? null,
      documentCategory: input.documentCategory ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'document.upload_requested.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'document',
          aggregate_id: document.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { filename: document.filename },
        }),
      )
      .execute();

    return { document, uploadUrl: url };
  }

  async confirmUpload(trx: Executor, ctx: RequestContext, id: string): Promise<DocumentRow> {
    const document = await this.repo.findById(trx, ctx.tenantId, id);
    if (!document) throw new NotFoundError('Document not found', { id });
    if (document.status !== 'pending_upload') {
      throw new ConflictError('Document is not awaiting upload', { id, status: document.status });
    }

    const head = await this.gateway.headObject({ storageKey: document.storageKey });
    if (!head) {
      throw new ConflictError('No object was found at the expected storage location', { id });
    }

    const stored = await this.repo.markStored(trx, ctx.tenantId, id, head.sizeBytes);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'document.stored.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'document',
          aggregate_id: stored.id,
          aggregate_version: 2,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { sizeBytes: stored.sizeBytes },
        }),
      )
      .execute();

    return stored;
  }

  async getDownloadUrl(trx: Executor, ctx: RequestContext, id: string): Promise<string> {
    const document = await this.repo.findById(trx, ctx.tenantId, id);
    if (!document) throw new NotFoundError('Document not found', { id });
    return this.gateway.getDownloadUrl({ storageKey: document.storageKey });
  }

  async list(trx: Executor, ctx: RequestContext, filter: { patientId?: string } = {}): Promise<DocumentRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }
}
