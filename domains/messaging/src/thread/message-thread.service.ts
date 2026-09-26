import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import { ConsentService } from '@ehr/consent';
import type { NotificationGateway } from '@ehr/notification-adapter';
import type { CreateMessageThreadInput, ReplyMessageInput } from './message-thread.dto.js';
import { getPortalAccountEmails, MessageThreadRepository, type MessageRow, type MessageThreadRow } from './message-thread.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;
type SenderType = 'staff' | 'portal';

/**
 * One service behind two controllers (staff and portal — EHR_BUILD_SPEC.md §17). Portal-facing
 * public methods call `ConsentService.assertAccess` first, exactly like every other portal read in
 * this phase; staff-facing public methods rely on the caller already being permission-checked by
 * `@ehr/authz` and skip that call. Both sides delegate to the same private core so the actual
 * thread/message mechanics exist in exactly one place.
 */
export class MessageThreadService {
  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly repo: MessageThreadRepository = new MessageThreadRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly consentService: ConsentService = new ConsentService(),
  ) {}

  async createThreadAsStaff(trx: Executor, ctx: RequestContext, patientId: string, input: CreateMessageThreadInput): Promise<MessageThreadRow> {
    await this.requirePatient(trx, ctx.tenantId, patientId);
    return this.createThread(trx, ctx, patientId, 'staff', input);
  }

  async createThreadAsPortal(trx: Executor, ctx: RequestContext, patientId: string, input: CreateMessageThreadInput): Promise<MessageThreadRow> {
    const portalAccountId = requirePortalActorId(ctx);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, patientId);
    return this.createThread(trx, ctx, patientId, 'portal', input);
  }

  async replyAsStaff(trx: Executor, ctx: RequestContext, threadId: string, input: ReplyMessageInput): Promise<MessageRow> {
    const thread = await this.requireThread(trx, ctx.tenantId, threadId);
    return this.reply(trx, ctx, thread, 'staff', ctx.actor?.id ?? ctx.tenantId, input);
  }

  async replyAsPortal(trx: Executor, ctx: RequestContext, threadId: string, input: ReplyMessageInput): Promise<MessageRow> {
    const portalAccountId = requirePortalActorId(ctx);
    const thread = await this.requireThread(trx, ctx.tenantId, threadId);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, thread.patientId);
    return this.reply(trx, ctx, thread, 'portal', portalAccountId, input);
  }

  async listThreadsAsStaff(trx: Executor, ctx: RequestContext, patientId: string): Promise<MessageThreadRow[]> {
    await this.requirePatient(trx, ctx.tenantId, patientId);
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async listThreadsAsPortal(trx: Executor, ctx: RequestContext, patientId: string): Promise<MessageThreadRow[]> {
    const portalAccountId = requirePortalActorId(ctx);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, patientId);
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async listMessagesAsStaff(trx: Executor, ctx: RequestContext, threadId: string): Promise<MessageRow[]> {
    await this.requireThread(trx, ctx.tenantId, threadId);
    return this.repo.listMessages(trx, ctx.tenantId, threadId);
  }

  async listMessagesAsPortal(trx: Executor, ctx: RequestContext, threadId: string): Promise<MessageRow[]> {
    const portalAccountId = requirePortalActorId(ctx);
    const thread = await this.requireThread(trx, ctx.tenantId, threadId);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, thread.patientId);
    return this.repo.listMessages(trx, ctx.tenantId, threadId);
  }

  async markReadAsStaff(trx: Executor, ctx: RequestContext, threadId: string): Promise<void> {
    await this.requireThread(trx, ctx.tenantId, threadId);
    await this.repo.markRead(trx, ctx.tenantId, threadId, 'staff', new Date());
  }

  async markReadAsPortal(trx: Executor, ctx: RequestContext, threadId: string): Promise<void> {
    const portalAccountId = requirePortalActorId(ctx);
    const thread = await this.requireThread(trx, ctx.tenantId, threadId);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, thread.patientId);
    await this.repo.markRead(trx, ctx.tenantId, threadId, 'portal', new Date());
  }

  private async createThread(
    trx: Executor,
    ctx: RequestContext,
    patientId: string,
    senderType: SenderType,
    input: CreateMessageThreadInput,
  ): Promise<MessageThreadRow> {
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const thread = await this.repo.createThread(trx, {
      tenantId: ctx.tenantId,
      patientId,
      subject: input.subject,
      createdByType: senderType,
      createdBy: actorId,
    });
    const message = await this.repo.addMessage(trx, {
      tenantId: ctx.tenantId,
      threadId: thread.id,
      senderType,
      senderId: actorId,
      body: input.body,
    });
    await this.repo.touchLastMessageAt(trx, ctx.tenantId, thread.id, message.createdAt, actorId);

    await this.emit(trx, ctx, 'message_thread.created.v1', 'message_thread', thread.id, thread.version, {
      patientId,
      subject: thread.subject,
    });
    await this.emitMessagePosted(trx, ctx, message);

    if (senderType === 'staff') {
      await this.notifyPortalRecipients(trx, ctx.tenantId, patientId);
    }

    return thread;
  }

  private async reply(
    trx: Executor,
    ctx: RequestContext,
    thread: MessageThreadRow,
    senderType: SenderType,
    senderId: string,
    input: ReplyMessageInput,
  ): Promise<MessageRow> {
    const message = await this.repo.addMessage(trx, {
      tenantId: ctx.tenantId,
      threadId: thread.id,
      senderType,
      senderId,
      body: input.body,
    });
    await this.repo.touchLastMessageAt(trx, ctx.tenantId, thread.id, message.createdAt, senderId);

    await this.emitMessagePosted(trx, ctx, message);

    if (senderType === 'staff') {
      await this.notifyPortalRecipients(trx, ctx.tenantId, thread.patientId);
    }
    // A portal reply also notifying staff is a documented gap (see README's Phase 8 scope
    // decisions): no assigned-practitioner/staff-inbox model exists yet to resolve a target.

    return message;
  }

  private async requirePatient(trx: Executor, tenantId: string, patientId: string): Promise<void> {
    const patient = await this.patientRepo.findById(trx, tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
  }

  private async requireThread(trx: Executor, tenantId: string, threadId: string): Promise<MessageThreadRow> {
    const thread = await this.repo.findById(trx, tenantId, threadId);
    if (!thread) throw new NotFoundError('Message thread not found', { threadId });
    return thread;
  }

  private async notifyPortalRecipients(trx: Executor, tenantId: string, patientId: string): Promise<void> {
    const activeGrants = await this.consentService.listActiveGrantsByPatient(trx, tenantId, patientId);
    const activePortalAccountIds = [...new Set(activeGrants.map((grant) => grant.portalAccountId))];
    if (activePortalAccountIds.length === 0) return;

    const emails = await getPortalAccountEmails(trx, tenantId, activePortalAccountIds);
    for (const portalAccountId of activePortalAccountIds) {
      const email = emails.get(portalAccountId);
      if (!email) continue;
      await this.notificationGateway.sendEmail({
        to: email,
        subject: 'You have a new secure message',
        body: 'Log in to the patient portal to read your new secure message.',
      });
    }
  }

  private async emitMessagePosted(trx: Executor, ctx: RequestContext, message: MessageRow): Promise<void> {
    await this.emit(trx, ctx, 'message.posted.v1', 'message', message.id, message.version, {
      threadId: message.threadId,
      senderType: message.senderType,
    });
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: aggregateType,
          aggregate_id: aggregateId,
          aggregate_version: aggregateVersion,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}

function requirePortalActorId(ctx: RequestContext): string {
  if (ctx.actor?.type !== 'patient') {
    throw new NotFoundError('Patient not found');
  }
  return ctx.actor.id;
}
