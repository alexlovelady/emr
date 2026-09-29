import * as argon2 from 'argon2';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { UserRepository, type UserRow } from './user.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface CreateUserInput {
  email: string;
  password: string;
}

/**
 * Phase 1 simplification: an admin directly sets the new user's password rather than an
 * email-invite/reset-link flow (no email-sending adapter exists yet — spec §29's
 * MessagingGateway is a later-phase concern). Revisit before any real onboarding.
 */
export class UserService {
  constructor(private readonly repo: UserRepository = new UserRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateUserInput): Promise<UserRow> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const actorId = ctx.actor?.id ?? null;

    let user: UserRow;
    try {
      user = await this.repo.create(trx, {
        tenantId: ctx.tenantId,
        email: input.email,
        passwordHash,
        createdBy: actorId ?? ctx.tenantId,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('A user with this email already exists in this tenant', { email: input.email });
      }
      throw err;
    }

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'user.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'user',
          aggregate_id: user.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { email: user.email },
        }),
      )
      .execute();

    return user;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<UserRow> {
    const user = await this.repo.findById(trx, ctx.tenantId, id);
    if (!user) throw new NotFoundError('User not found', { id });
    return user;
  }

  async list(trx: Executor, ctx: RequestContext, pagination: { limit?: number | undefined; offset?: number | undefined } = {}): Promise<UserRow[]> {
    return this.repo.list(trx, ctx.tenantId, pagination);
  }
}

/** Postgres unique_violation (23505) — see https://www.postgresql.org/docs/current/errcodes-appendix.html */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}
