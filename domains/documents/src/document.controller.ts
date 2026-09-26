import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { RequestUploadSchema, type RequestUploadInput } from './document.dto.js';
import { DocumentService } from './document.service.js';
import { OBJECT_STORAGE_GATEWAY } from './object-storage-gateway.token.js';

@Controller('api/v1/documents')
export class DocumentController {
  private readonly service: DocumentService;

  constructor(@Inject(OBJECT_STORAGE_GATEWAY) gateway: ObjectStorageGateway) {
    this.service = new DocumentService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.DOCUMENT_UPLOAD)
  @Audited('document.upload_requested', 'Document')
  async requestUpload(@Body(new ZodValidationPipe(RequestUploadSchema)) body: RequestUploadInput, @Req() req: FastifyRequest) {
    return this.service.requestUpload(getCurrentTransaction(), requireCtx(req), body);
  }

  @Post(':id/confirm')
  @RequirePermission(PERMISSION_KEYS.DOCUMENT_UPLOAD)
  @Audited('document.confirm_upload', 'Document')
  async confirmUpload(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.confirmUpload(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get(':id/download-url')
  @RequirePermission(PERMISSION_KEYS.DOCUMENT_DOWNLOAD)
  @Audited('document.download', 'Document')
  async getDownloadUrl(@Param('id') id: string, @Req() req: FastifyRequest) {
    const url = await this.service.getDownloadUrl(getCurrentTransaction(), requireCtx(req), id);
    return { url };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
