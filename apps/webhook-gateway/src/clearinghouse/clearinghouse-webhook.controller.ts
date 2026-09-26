import { Controller, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { ValidationError } from '@ehr/domain-common';
import type { Env } from '@ehr/config';
import { CLEARINGHOUSE_GATEWAY } from '@ehr/claims';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { DB_CONNECTION, OWNER_DB_CONNECTION, ENV_CONFIG } from '../common/tokens.js';
import { verifyWebhookSignature } from '../common/webhook-signature.js';
import { ClearinghouseWebhookService } from './clearinghouse-webhook.service.js';

/**
 * Accepts a raw `text/plain` JSON body (Fastify's built-in parser — same simplification as
 * `apps/interop-hl7`'s raw HL7 body) standing in for a real X12 277CA/835 transport, which spec
 * §13.1 marks as a "buy" item. Every request MUST carry a valid `X-Webhook-Signature: sha256=...`
 * HMAC header (spec §12's "signed webhooks") — verified against the exact raw bytes before the
 * body is even parsed as JSON.
 */
@Controller('webhooks/clearinghouse')
export class ClearinghouseWebhookController {
  constructor(
    @Inject(ENV_CONFIG) private readonly env: Env,
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
    @Inject(OWNER_DB_CONNECTION) private readonly ownerDb: Kysely<DB>,
    @Inject(CLEARINGHOUSE_GATEWAY) private readonly gateway: ClearinghouseGateway,
  ) {}

  @Post('277ca')
  async handle277ca(@Req() req: FastifyRequest) {
    const rawBody = this.verifyAndGetRawBody(req);
    return new ClearinghouseWebhookService(this.gateway, this.db, this.ownerDb).handle277ca(rawBody);
  }

  @Post('835')
  async handle835(@Req() req: FastifyRequest) {
    const rawBody = this.verifyAndGetRawBody(req);
    return new ClearinghouseWebhookService(this.gateway, this.db, this.ownerDb).handle835(rawBody);
  }

  private verifyAndGetRawBody(req: FastifyRequest): string {
    const rawBody = req.body;
    if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
      throw new ValidationError('Request body must be a non-empty raw JSON payload (Content-Type: text/plain)');
    }
    const signatureHeader = req.headers['x-webhook-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!verifyWebhookSignature(rawBody, signature, this.env.WEBHOOK_SIGNING_SECRET)) {
      throw new UnauthorizedException('Invalid or missing webhook signature');
    }
    return rawBody;
  }
}
