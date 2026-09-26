import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import type { PrescribingGateway } from '@ehr/erx-adapter';
import { ERX_GATEWAY } from '../erx-gateway.token.js';

/**
 * Thin read-only passthrough to the injected `PrescribingGateway` — no repository, no
 * persistence. Spec §14 lists `searchMedication`/`searchPharmacy`/`getFormulary` as part of the
 * vendor adapter itself; medication history/formulary is spec-marked "if provided" (vendor
 * optional), but since these are stateless reads with no new DB surface, building them fully here
 * costs little and keeps Phase 5's bullet list structurally complete.
 */
@Controller('api/v1/erx')
export class ErxLookupController {
  constructor(@Inject(ERX_GATEWAY) private readonly gateway: PrescribingGateway) {}

  @Get('medications/search')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('erx.medication_search', 'ErxLookup')
  async searchMedication(@Query('query') query: string | undefined) {
    return this.gateway.searchMedication(query ?? '');
  }

  @Get('pharmacies/search')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('erx.pharmacy_search', 'ErxLookup')
  async searchPharmacy(@Query('query') query: string | undefined) {
    return this.gateway.searchPharmacy(query ?? '');
  }

  @Get('formulary')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('erx.formulary_lookup', 'ErxLookup')
  async getFormulary(@Query('medicationCode') medicationCode: string) {
    return this.gateway.getFormulary(medicationCode);
  }
}
