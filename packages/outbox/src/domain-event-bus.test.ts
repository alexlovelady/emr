import { describe, expect, it, vi } from 'vitest';
import { DomainEventBus } from './domain-event-bus.js';
import type { DomainEvent } from './domain-event.js';

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    event_id: '11111111-1111-1111-1111-111111111111',
    event_type: 'location.created.v1',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    aggregate_type: 'location',
    aggregate_id: '33333333-3333-3333-3333-333333333333',
    aggregate_version: 1,
    occurred_at: new Date().toISOString(),
    actor_id: null,
    correlation_id: '44444444-4444-4444-4444-444444444444',
    causation_id: null,
    data: {},
    ...overrides,
  };
}

describe('DomainEventBus', () => {
  it('delivers to a handler subscribed to the specific event_type', async () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    bus.on('location.created.v1', handler);

    const event = makeEvent();
    await bus.publish(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not deliver to handlers subscribed to a different event_type', async () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    bus.on('location.updated.v1', handler);

    await bus.publish(makeEvent({ event_type: 'location.created.v1' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers every event to a wildcard ("*") subscriber', async () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    bus.on('*', handler);

    await bus.publish(makeEvent({ event_type: 'location.created.v1' }));
    await bus.publish(makeEvent({ event_type: 'organization.created.v1' }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes when the returned function is called', async () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('location.created.v1', handler);
    unsubscribe();

    await bus.publish(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });
});
