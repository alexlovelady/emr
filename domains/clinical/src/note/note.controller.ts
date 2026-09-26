import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateNoteSchema,
  UpdateNoteContentSchema,
  VoidNoteSchema,
  type CreateNoteInput,
  type UpdateNoteContentInput,
  type VoidNoteInput,
} from './note.dto.js';
import { NoteService } from './note.service.js';

@Controller('api/v1/notes')
export class NoteController {
  constructor(private readonly service: NoteService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('note.create', 'Note')
  async create(@Body(new ZodValidationPipe(CreateNoteSchema)) body: CreateNoteInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('note.read', 'Note')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getWithChain(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('note.list', 'Note')
  async listByEncounter(@Query('encounterId') encounterId: string, @Req() req: FastifyRequest) {
    return this.service.listByEncounter(getCurrentTransaction(), requireCtx(req), encounterId);
  }

  @Put(':id/content')
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('note.update_content', 'Note')
  async updateContent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateNoteContentSchema)) body: UpdateNoteContentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.updateContent(getCurrentTransaction(), requireCtx(req), id, body.content);
  }

  @Post(':id/submit-for-review')
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('note.submit_for_review', 'Note')
  async submitForReview(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.submitForReview(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/sign')
  @RequirePermission(PERMISSION_KEYS.NOTE_SIGN)
  @Audited('note.sign', 'Note')
  async sign(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.sign(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/void')
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('note.void', 'Note')
  async void(@Param('id') id: string, @Body(new ZodValidationPipe(VoidNoteSchema)) body: VoidNoteInput, @Req() req: FastifyRequest) {
    return this.service.void(getCurrentTransaction(), requireCtx(req), id, body.reason);
  }

  @Post(':id/amend')
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('note.amend', 'Note')
  async amend(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.amend(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
