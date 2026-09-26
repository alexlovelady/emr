import { Body, Controller, Inject, Post } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import type { KeyMaterial } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { OWNER_DB_CONNECTION, ENV_CONFIG, KEY_MATERIAL } from '../common/tokens.js';
import { TokenRequestSchema, type TokenRequestInput, type TokenResponse } from './token.dto.js';
import { TokenService } from './token.service.js';

/**
 * Accepts a JSON body rather than RFC6749's usual `application/x-www-form-urlencoded` — a real
 * SMART client would need form-encoded support added here; this thin implementation only needs
 * to prove the client-credentials grant + scope-gating mechanism end to end (see the seeded
 * `smart_clients` test fixture, which is JSON-body-only by the same token).
 */
@Controller('fhir/r4/token')
export class TokenController {
  private readonly service: TokenService;

  constructor(
    @Inject(OWNER_DB_CONNECTION) ownerDb: Kysely<DB>,
    @Inject(KEY_MATERIAL) keys: KeyMaterial,
    @Inject(ENV_CONFIG) env: Env,
  ) {
    this.service = new TokenService(ownerDb, keys, env);
  }

  @Post()
  async issueToken(@Body(new ZodValidationPipe(TokenRequestSchema)) body: TokenRequestInput): Promise<TokenResponse> {
    return this.service.issueToken(body);
  }
}
