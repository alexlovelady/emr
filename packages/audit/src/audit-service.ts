import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AuditEnvelope } from './audit-event.js';

/**
 * Inserts exactly one row per audit event. Callers MUST pass the same transaction/connection the
 * associated domain write used (see packages/db's runWithRequestTransaction /
 * getCurrentTransaction) — spec §7.1's audit guarantee only holds if a rolled-back domain write
 * can never leave a stray audit row behind, and vice versa.
 */
export async function recordAuditEvent(
  db: Kysely<DB> | Transaction<DB>,
  envelope: AuditEnvelope,
): Promise<void> {
  await db
    .insertInto('audit_events')
    .values({
      tenant_id: envelope.tenantId,
      occurred_at: new Date(),
      actor_type: envelope.actor.type,
      actor_id: envelope.actor.id,
      action: envelope.action,
      resource_type: envelope.resource.type,
      resource_id: envelope.resource.id,
      patient_id: envelope.resource.patientId ?? null,
      purpose: envelope.purpose ?? null,
      request_id: envelope.requestId,
      ip: envelope.ip ?? null,
      user_agent: envelope.userAgent ?? null,
      outcome: envelope.outcome,
      metadata: JSON.stringify(envelope.metadata ?? {}),
    })
    .execute();
}
