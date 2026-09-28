import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { PractitionerRepository } from '@ehr/workforce';
import { LocationRepository } from '@ehr/tenant';

type Executor = Kysely<DB> | Transaction<DB>;

/** Patient-safe subset of a practitioner row — never the internal `workforceIdentityId`/
 * `organizationId`/NPI, none of which a patient choosing who to book with needs to see. */
export interface BookablePractitioner {
  id: string;
  displayName: string;
  taxonomyCode: string | null;
}

/** Patient-safe subset of a location row — drops `organizationId`, timestamps, version. */
export interface BookableLocation {
  id: string;
  name: string;
  timeZone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

/**
 * Tenant-wide (not per-patient) lookups a patient needs to choose who/where to book with — no
 * `ConsentService.assertAccess` call here since nothing patient-specific is returned, just the
 * same "any authenticated portal actor" check every portal controller already makes.
 */
export class PortalSchedulingService {
  constructor(
    private readonly practitionerRepo: PractitionerRepository = new PractitionerRepository(),
    private readonly locationRepo: LocationRepository = new LocationRepository(),
  ) {}

  async listBookablePractitioners(trx: Executor, ctx: RequestContext): Promise<BookablePractitioner[]> {
    this.assertPortalActor(ctx);
    const practitioners = await this.practitionerRepo.list(trx, ctx.tenantId);
    return practitioners
      .filter((p) => p.status === 'active')
      .map((p) => ({ id: p.id, displayName: p.displayName, taxonomyCode: p.taxonomyCode }));
  }

  async listBookableLocations(trx: Executor, ctx: RequestContext): Promise<BookableLocation[]> {
    this.assertPortalActor(ctx);
    const locations = await this.locationRepo.list(trx, ctx.tenantId);
    return locations
      .filter((l) => l.status === 'active')
      .map((l) => ({
        id: l.id,
        name: l.name,
        timeZone: l.timeZone,
        addressLine1: l.addressLine1,
        addressLine2: l.addressLine2,
        city: l.city,
        state: l.state,
        postalCode: l.postalCode,
      }));
  }

  private assertPortalActor(ctx: RequestContext): void {
    if (ctx.actor?.type !== 'patient') throw new ForbiddenError('No authenticated portal actor on request');
  }
}
