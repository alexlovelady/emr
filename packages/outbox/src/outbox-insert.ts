import { randomUUID } from 'node:crypto';
import type { Insertable } from 'kysely';
import type { DB } from '@ehr/db';
import type { NewDomainEvent } from './domain-event.js';

/**
 * Builds the row a domain service inserts into `outbox_events` alongside its own write, in the
 * SAME `withTenantContext` transaction (spec rule #12 — never `commit` then `publish` as two
 * separate steps). This is a pure builder; it does not touch the database itself.
 */
export function buildOutboxInsert(event: NewDomainEvent): Insertable<DB['outbox_events']> {
  return {
    tenant_id: event.tenant_id,
    id: event.event_id ?? randomUUID(),
    event_type: event.event_type,
    aggregate_type: event.aggregate_type,
    aggregate_id: event.aggregate_id,
    aggregate_version: String(event.aggregate_version),
    occurred_at: event.occurred_at ?? new Date().toISOString(),
    actor_id: event.actor_id,
    correlation_id: event.correlation_id,
    causation_id: event.causation_id,
    // Kysely's JSONColumnType requires a pre-serialized string on insert/update — it never
    // serializes JS values for you (see Kysely's JSON columns docs).
    data: JSON.stringify(event.data),
    status: 'pending',
  };
}
