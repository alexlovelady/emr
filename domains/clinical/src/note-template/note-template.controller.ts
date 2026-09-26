import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateNoteTemplateSchema, type CreateNoteTemplateInput } from './note-template.dto.js';
import { NoteTemplateService } from './note-template.service.js';

@Controller('api/v1/note-templates')
export class NoteTemplateController {
  constructor(private readonly service: NoteTemplateService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('note_template.create', 'NoteTemplate')
  async create(@Body(new ZodValidationPipe(CreateNoteTemplateSchema)) body: CreateNoteTemplateInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('note_template.read', 'NoteTemplate')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('note_template.list', 'NoteTemplate')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
