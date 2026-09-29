import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { PERMISSION_KEYS } from '@ehr/authz';
import { buildOutboxInsert } from '@ehr/outbox';
import type { AssignRoleInput, CreateRoleInput, GrantPermissionInput } from './role.dto.js';
import { RoleRepository, type RoleRow, type UserRoleGrant, type UserRoleRow } from './role.repository.js';
import { UserRepository } from '../user/user.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const VALID_PERMISSION_KEYS = new Set<string>(Object.values(PERMISSION_KEYS));

export class RoleService {
  constructor(
    private readonly repo: RoleRepository = new RoleRepository(),
    private readonly userRepo: UserRepository = new UserRepository(),
  ) {}

  async list(trx: Executor): Promise<RoleRow[]> {
    return this.repo.list(trx);
  }

  async createRole(trx: Executor, input: CreateRoleInput): Promise<RoleRow> {
    const existing = await this.repo.findByKey(trx, input.key);
    if (existing) throw new ConflictError('A role with this key already exists', { key: input.key });
    return this.repo.createRole(trx, input);
  }

  async listPermissions(trx: Executor, roleId: string): Promise<string[]> {
    const role = await this.repo.findById(trx, roleId);
    if (!role) throw new NotFoundError('Role not found', { roleId });
    return this.repo.listPermissions(trx, roleId);
  }

  async grantPermission(trx: Executor, roleId: string, input: GrantPermissionInput): Promise<string[]> {
    const role = await this.repo.findById(trx, roleId);
    if (!role) throw new NotFoundError('Role not found', { roleId });
    if (!VALID_PERMISSION_KEYS.has(input.permissionKey)) {
      throw new ValidationError('Unknown permission key', { permissionKey: input.permissionKey });
    }
    await this.repo.grantPermission(trx, roleId, input.permissionKey);
    return this.repo.listPermissions(trx, roleId);
  }

  async revokePermission(trx: Executor, roleId: string, permissionKey: string): Promise<string[]> {
    const role = await this.repo.findById(trx, roleId);
    if (!role) throw new NotFoundError('Role not found', { roleId });
    await this.repo.revokePermission(trx, roleId, permissionKey);
    return this.repo.listPermissions(trx, roleId);
  }

  async listGrantsForUser(trx: Executor, ctx: RequestContext, userId: string): Promise<UserRoleGrant[]> {
    const user = await this.userRepo.findById(trx, ctx.tenantId, userId);
    if (!user) throw new NotFoundError('User not found', { id: userId });
    return this.repo.listActiveGrantsForUser(trx, ctx.tenantId, userId);
  }

  /** Same data as `listGrantsForUser`, batched — a user row that doesn't exist (or belongs to
   * another tenant) simply has no grants in the result, rather than 404ing the whole batch. */
  async listGrantsForUsers(trx: Executor, ctx: RequestContext, userIds: string[]): Promise<UserRoleGrant[]> {
    return this.repo.listActiveGrantsForUsers(trx, ctx.tenantId, userIds);
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
