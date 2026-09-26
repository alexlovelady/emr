import type { Kysely, Selectable } from 'kysely';
import type { DB } from '@ehr/db';
import type { DomainEvent, EventPublisher } from './domain-event.js';

export interface OutboxRelayOptions {
  pollIntervalMs: number;
  batchSize: number;
}

/**
 * Polls `outbox_events` across ALL tenants and dispatches pending rows to an `EventPublisher`
 * (ADR-0002: an in-process `DomainEventBus` for now, a real bus later — only this class's
 * constructor argument changes when that happens).
 *
 * Must be constructed with a `Kysely<DB>` connected via the bootstrap/owner role
 * (DATABASE_URL), the same trust boundary migrations and seeds use — NOT the `ehr_app` role.
 * This is a deliberate, documented exception to "the app always connects as ehr_app": the relay
 * is a trusted background process reading/updating outbox bookkeeping across every tenant in one
 * loop, not a per-request handler serving a specific tenant's data to a user, so there is no
 * `app.tenant_id` to scope a single connection to. It never exposes `outbox_events` rows to any
 * tenant-facing API — it only republishes them to in-process subscribers within the same trusted
 * worker process. If a future consumer subscribed to this bus ever serves data back out over an
 * API, THAT code path must still go through the authz layer like anything else (spec rule #3) —
 * this class's elevated DB access does not extend any authority to its subscribers.
 *
 * At-least-once, not exactly-once: a crash between `publish()` succeeding and the row being
 * marked `published` will redeliver the event on the next tick. Subscribers must be idempotent.
 */
export class OutboxRelay {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly publisher: EventPublisher,
    private readonly options: OutboxRelayOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Processes one batch of pending rows. Exposed directly for tests and manual triggering. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const rows = await this.db
        .selectFrom('outbox_events')
        .selectAll()
        .where('status', '=', 'pending')
        .orderBy('created_at', 'asc')
        .limit(this.options.batchSize)
        .execute();

      for (const row of rows) {
        await this.processRow(row);
      }
      return rows.length;
    } finally {
      this.running = false;
    }
  }

  private async processRow(row: Selectable<DB['outbox_events']>): Promise<void> {
    const event: DomainEvent = {
      event_id: row.id,
      event_type: row.event_type,
      tenant_id: row.tenant_id,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      aggregate_version: Number(row.aggregate_version),
      occurred_at: row.occurred_at.toISOString(),
      actor_id: row.actor_id,
      correlation_id: row.correlation_id,
      causation_id: row.causation_id,
      data: row.data,
    };

    try {
      await this.publisher.publish(event);
      await this.db
        .updateTable('outbox_events')
        .set({ status: 'published', published_at: new Date() })
        .where('id', '=', row.id)
        .where('tenant_id', '=', row.tenant_id)
        .execute();
    } catch (err) {
      await this.db
        .updateTable('outbox_events')
        .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
        .where('id', '=', row.id)
        .where('tenant_id', '=', row.tenant_id)
        .execute();
      console.error(`[OutboxRelay] failed to publish ${row.event_type} (${row.id}):`, err);
    }
  }
}
