/**
 * EHR_BUILD_SPEC.md §10 domain event envelope, exactly. Events are immutable and versioned by
 * `event_type` (e.g. "encounter.signed.v1") — never mutate a published event's shape, add a new
 * `.v2` type instead.
 */
export interface DomainEvent<TData extends Record<string, unknown> = Record<string, unknown>> {
  event_id: string;
  event_type: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  occurred_at: string;
  actor_id: string | null;
  correlation_id: string;
  causation_id: string | null;
  data: TData;
}

/** What a domain service provides when appending to the outbox — id/occurred_at are filled in. */
export type NewDomainEvent<TData extends Record<string, unknown> = Record<string, unknown>> = Omit<
  DomainEvent<TData>,
  'event_id' | 'occurred_at'
> & {
  event_id?: string;
  occurred_at?: string;
};

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
