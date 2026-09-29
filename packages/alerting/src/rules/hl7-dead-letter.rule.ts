import type { AlertFinding, AlertRule } from '../alert.types.js';

export interface Hl7DeadLetterRuleOptions {
  countThreshold: number;
}

/**
 * One alert per tenant (dedupeKey = tenant id), not one shared alert for the whole platform — a
 * dead-lettered HL7 message (item 15: exhausted retries, or a permanent correlation/validation
 * failure) needs that specific tenant's interface engine or reference data fixed, so the finding
 * carries `tenantId` for the admin UI to route/filter it to the right audience.
 */
export function createHl7DeadLetterRule(options: Hl7DeadLetterRuleOptions): AlertRule {
  return {
    key: 'hl7_dead_letter',
    description: 'Alerts per tenant when dead-lettered HL7 messages exceed the configured threshold.',
    async evaluate(db): Promise<AlertFinding[]> {
      const rows = await db
        .selectFrom('hl7_messages')
        .select((eb) => ['tenant_id', eb.fn.countAll<string>().as('count')])
        .where('dead_letter', '=', true)
        .groupBy('tenant_id')
        .execute();

      return rows
        .filter((r) => Number(r.count) >= options.countThreshold)
        .map(
          (r): AlertFinding => ({
            ruleKey: 'hl7_dead_letter',
            dedupeKey: r.tenant_id,
            severity: 'warning',
            title: 'HL7 messages are stuck in the dead-letter queue',
            detail: { tenantId: r.tenant_id, deadLetterCount: Number(r.count) },
            tenantId: r.tenant_id,
          }),
        );
    },
  };
}
