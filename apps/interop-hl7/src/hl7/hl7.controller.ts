import { Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { Hl7IngestionService } from './hl7.service.js';

/**
 * Accepts a raw HL7 v2 message body (`Content-Type: text/plain`, Fastify's built-in parser) —
 * this stands in for a real MLLP TCP listener (spec §12.1), which is out of scope in a
 * synthetic/dev environment with no real lab interface partner. The response mirrors the
 * ACK/NACK shape the pipeline calls for, just carried over HTTP instead of MLLP framing.
 */
@Controller('interop/hl7/messages')
export class Hl7Controller {
  constructor(@Inject(Hl7IngestionService) private readonly service: Hl7IngestionService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.INTEROP_HL7_INGEST)
  @Audited('hl7_message.ingest', 'Hl7Message')
  async ingest(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<Record<string, unknown>> {
    const body = req.body;
    if (typeof body !== 'string' || body.trim().length === 0) {
      throw new ValidationError('Request body must be a non-empty raw HL7 v2 message (Content-Type: text/plain)');
    }
    const result = await this.service.ingest(getCurrentTransaction(), requireCtx(req), body);
    if (result.ackCode === 'AE') res.status(422);
    return {
      ackCode: result.ackCode,
      messageId: result.messageId,
      ...(result.detail ? { detail: result.detail } : {}),
    };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
