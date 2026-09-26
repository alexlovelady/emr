import { describe, expect, it } from 'vitest';
import { buildOutboxInsert } from './outbox-insert.js';

describe('buildOutboxInsert', () => {
  it('fills in event_id and occurred_at when omitted, status defaults to pending', () => {
    const row = buildOutboxInsert({
      event_type: 'location.created.v1',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      aggregate_type: 'location',
      aggregate_id: '33333333-3333-3333-3333-333333333333',
      aggregate_version: 1,
      actor_id: null,
      correlation_id: '44444444-4444-4444-4444-444444444444',
      causation_id: null,
      data: { name: 'Main Office' },
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.occurred_at).toBeTypeOf('string');
    expect(row.status).toBe('pending');
    expect(row.aggregate_version).toBe('1');
    expect(JSON.parse(row.data as string)).toEqual({ name: 'Main Office' });
  });

  it('respects an explicitly provided event_id and occurred_at', () => {
    const row = buildOutboxInsert({
      event_id: '99999999-9999-9999-9999-999999999999',
      occurred_at: '2026-01-01T00:00:00.000Z',
      event_type: 'location.created.v1',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      aggregate_type: 'location',
      aggregate_id: '33333333-3333-3333-3333-333333333333',
      aggregate_version: 2,
      actor_id: 'actor-1',
      correlation_id: '44444444-4444-4444-4444-444444444444',
      causation_id: null,
      data: {},
    });

    expect(row.id).toBe('99999999-9999-9999-9999-999999999999');
    expect(row.occurred_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
