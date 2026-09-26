import { Controller, Get, Inject } from '@nestjs/common';
import { SkipAudit } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import type { IdentityProvider } from '@ehr/auth-adapter';
import { IDENTITY_PROVIDER } from '../common/tokens.js';

@Controller('.well-known')
@SkipAuthz()
@SkipAudit()
export class JwksController {
  constructor(@Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider) {}

  @Get('jwks.json')
  async jwks() {
    return this.identityProvider.getJWKS();
  }
}
