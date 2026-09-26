import { Controller, Get } from '@nestjs/common';
import { SkipAudit } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';

@Controller()
export class HealthController {
  @Get('healthz')
  @SkipAuthz()
  @SkipAudit()
  healthz(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
