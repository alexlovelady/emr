import { Controller, Get, Query } from '@nestjs/common';
import { getCurrentTransaction } from '@ehr/db';
import { ValidationError } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { TerminologyService } from '@ehr/terminology';

/**
 * Read-only reference-data lookup, not patient data — gated on `PATIENT_READ_CLINICAL` (the same
 * broad "can view clinical context" permission `domains/query`'s `SearchController` uses) since
 * every caller of this endpoint is already mid-way through adding a problem or prescribing a
 * medication, which requires that permission anyway.
 */
@Controller('api/v1/terminology')
export class TerminologyController {
  private readonly service = new TerminologyService();

  @Get('search')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('terminology.search', 'TerminologyCode')
  async search(@Query('system') system: string | undefined, @Query('query') query: string | undefined) {
    if (!system) throw new ValidationError('Query parameter "system" is required');
    if (!query || query.trim().length === 0) throw new ValidationError('Query parameter "query" is required');
    const results = await this.service.searchConcepts(getCurrentTransaction(), system, query);
    return { items: results };
  }

  @Get('validate')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('terminology.validate', 'TerminologyCode')
  async validate(@Query('system') system: string | undefined, @Query('code') code: string | undefined) {
    if (!system) throw new ValidationError('Query parameter "system" is required');
    if (!code) throw new ValidationError('Query parameter "code" is required');
    return this.service.validateCode(getCurrentTransaction(), system, code);
  }
}
