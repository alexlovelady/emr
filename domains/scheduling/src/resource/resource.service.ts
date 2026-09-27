import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { LocationRepository } from '@ehr/tenant';
import type { CreateResourceInput } from './resource.dto.js';
import { ResourceRepository, type ResourceRow } from './resource.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * A bookable room/equipment item, scoped to a location — used by AppointmentService to check
 * multi-resource double-booking (see appointment.service.ts's `findOverlappingByResource`).
 */
export class ResourceService {
  constructor(
    private readonly repo: ResourceRepository = new ResourceRepository(),
    private readonly locationRepo: LocationRepository = new LocationRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateResourceInput): Promise<ResourceRow> {
    const location = await this.locationRepo.findById(trx, ctx.tenantId, input.locationId);
    if (!location) throw new NotFoundError('Location not found', { locationId: input.locationId });

    const actorId = ctx.actor?.id ?? null;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      locationId: input.locationId,
      name: input.name,
      resourceType: input.resourceType,
      createdBy: actorId ?? ctx.tenantId,
    });
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ResourceRow> {
    const resource = await this.repo.findById(trx, ctx.tenantId, id);
    if (!resource) throw new NotFoundError('Resource not found', { id });
    return resource;
  }

  async list(trx: Executor, ctx: RequestContext, filter: { locationId?: string } = {}): Promise<ResourceRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }
}
