import { EventEmitter } from 'node:events';
import type { DomainEvent, EventPublisher } from './domain-event.js';

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * In-process event bus (ADR-0002): stands in for a real durable event bus (Kafka/MSK, Phase
 * 4/7) until Phase 1 has consumers that actually need multi-process/durable fan-out. Domain code
 * should depend on the `EventPublisher` interface, not this class directly, so swapping the
 * implementation later never touches call sites.
 */
export class DomainEventBus implements EventPublisher {
  private readonly emitter = new EventEmitter({ captureRejections: true });

  constructor() {
    this.emitter.setMaxListeners(50);
    this.emitter.on('error', (err: unknown) => {
      // A handler throwing must not crash the relay loop — surface it, don't swallow it silently.
      console.error('[DomainEventBus] handler error:', err);
    });
  }

  async publish(event: DomainEvent): Promise<void> {
    this.emitter.emit(event.event_type, event);
    this.emitter.emit('*', event);
  }

  /** Subscribe to a specific event_type (e.g. "location.created.v1"), or "*" for everything. */
  on(eventType: string, handler: DomainEventHandler): () => void {
    const wrapped = (event: DomainEvent): void => {
      Promise.resolve(handler(event)).catch((err: unknown) => this.emitter.emit('error', err));
    };
    this.emitter.on(eventType, wrapped);
    return () => this.emitter.off(eventType, wrapped);
  }
}
