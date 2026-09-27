import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { AssignRoleInput } from './role.dto.js';
import { RoleRepository, type RoleRow, type UserRoleRow } from './role.repository.js';
import { UserRepository } from '../user/user.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class RoleService {
  constructor(
    private readonly repo: RoleRepository = new RoleRepository(),
    private readonly userRepo: UserRepository = new UserRepository(),
  ) {}

  async list(trx: Executor): Promise<RoleRow[]> {
    return this.repo.list(trx);
  }

  async assignToUser(trx: Executor, ctx: RequestContext, userId: string, input: AssignRoleInput): Promise<UserRoleRow> {
    const user = await this.userRepo.findById(trx, ctx.tenantId, userId);
    if (!user) throw new NotFoundError('User not found', { id: userId });

    const role = await this.repo.findByKey(trx, input.roleKey);
    if (!role) throw new NotFoundError('Role not found', { roleKey: input.roleKey });

    const existing = await this.repo.findActiveGrant(trx, ctx.tenantId, userId, role.id);
    if (existing) {
      throw new ConflictError('User already has this role', { userId, roleKey: input.roleKey });
    }

    const actorId = ctx.actor?.id ?? null;
    const grant = await this.repo.grant(trx, {
      tenantId: ctx.tenantId,
      userId,
      roleId: role.id,
      grantedBy: actorId,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'user.role_granted.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'user',
          aggregate_id: userId,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { roleKey: role.key },
        }),
      )
      .execute();

    return grant;
  }
}
