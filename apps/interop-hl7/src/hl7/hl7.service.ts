import { createHash } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';
import { parseOruR01, Hl7ParseError, type ParsedOruObservation } from '@ehr/hl7';
import { OrderRepository } from '@ehr/orders';
import { DiagnosticReportService, type CreateDiagnosticReportInput } from '@ehr/results';
import { Hl7MessageRepository } from './hl7-message.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface Hl7IngestResult {
  ackCode: 'AA' | 'AE';
  messageId: string;
  detail?: string;
}

const CRITICAL_FLAGS = new Set(['HH', 'LL', 'AA']);
const NORMAL_FLAGS = new Set(['N', '']);

/**
 * EHR_BUILD_SPEC.md §12.1's pipeline: "Listener -> raw immutable message store -> parse ->
 * validate -> route -> transform -> canonical staging -> reconciliation/idempotency -> commit ->
 * ACK/NACK -> event." The "route" step correlates a result back to the order that produced it via
 * OBR-2 (placer order number) — our `NoopLabOrderGateway` (packages/lab-adapter) always sets the
 * placer order number to our own order id, exactly so this correlation is a normal id lookup, not
 * a fuzzy match. A message that can't be correlated (unknown/missing placer order number) is a
 * legitimate NACK, not a crash.
 */
export class Hl7IngestionService {
  constructor(
    private readonly messageRepo: Hl7MessageRepository = new Hl7MessageRepository(),
    private readonly orderRepo: OrderRepository = new OrderRepository(),
    private readonly reportService: DiagnosticReportService = new DiagnosticReportService(),
  ) {}

  async ingest(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<Hl7IngestResult> {
    const actorId = ctx.actor?.id ?? ctx.tenantId;

    let messageControlId: string;
    let messageType = 'UNKNOWN';
    let observations: ParsedOruObservation[] = [];
    let placerOrderNumber: string | null = null;
    let reportCode: string | null = null;
    let reportDisplay: string | null = null;
    let reportCodeSystem: string | null = null;

    try {
      const parsed = parseOruR01(rawMessage);
      messageControlId = parsed.messageControlId;
      messageType = parsed.messageType;
      observations = parsed.observations;
      placerOrderNumber = parsed.placerOrderNumber;
      reportCode = parsed.reportCode;
      reportDisplay = parsed.reportDisplay;
      reportCodeSystem = parsed.reportCodeSystem;
    } catch (err) {
      // Genuinely unparseable — no MSH-10 to key on, so fall back to a content hash. The raw
      // message is still stored, never discarded, per spec §12.1.
      messageControlId = `unparseable-${createHash('sha256').update(rawMessage).digest('hex').slice(0, 16)}`;
      const existing = await this.messageRepo.findByControlId(trx, ctx.tenantId, messageControlId);
      if (existing) return { ackCode: 'AE', messageId: existing.id, ...(existing.parseError ? { detail: existing.parseError } : {}) };

      const detail = err instanceof Hl7ParseError ? err.message : err instanceof Error ? err.message : String(err);
      const stored = await this.messageRepo.create(trx, { tenantId: ctx.tenantId, messageControlId, messageType, rawMessage, createdBy: actorId });
      await this.messageRepo.markFailed(trx, ctx.tenantId, stored.id, detail, actorId);
      return { ackCode: 'AE', messageId: stored.id, detail };
    }

    const existing = await this.messageRepo.findByControlId(trx, ctx.tenantId, messageControlId);
    if (existing) {
      // Idempotent redelivery (spec §12.1) — never reprocess a message control ID we've already stored.
      return {
        ackCode: existing.status === 'failed' ? 'AE' : 'AA',
        messageId: existing.id,
        ...(existing.parseError ? { detail: existing.parseError } : {}),
      };
    }

    const stored = await this.messageRepo.create(trx, { tenantId: ctx.tenantId, messageControlId, messageType, rawMessage, createdBy: actorId });

    if (!placerOrderNumber) {
      const detail = 'Missing OBR-2 (placer order number) — cannot correlate this result to an order';
      await this.messageRepo.markFailed(trx, ctx.tenantId, stored.id, detail, actorId);
      return { ackCode: 'AE', messageId: stored.id, detail };
    }

    const order = await this.orderRepo.findById(trx, ctx.tenantId, placerOrderNumber);
    if (!order) {
      const detail = `No order found matching placer order number ${placerOrderNumber}`;
      await this.messageRepo.markFailed(trx, ctx.tenantId, stored.id, detail, actorId);
      return { ackCode: 'AE', messageId: stored.id, detail };
    }

    const results: CreateDiagnosticReportInput['results'] = observations.map((obs) => {
      const numeric = obs.value !== null && obs.value !== '' && !Number.isNaN(Number(obs.value));
      return {
        code: obs.code ?? 'unknown',
        display: obs.display ?? obs.code ?? 'Result',
        valueQuantity: numeric ? Number(obs.value) : null,
        valueText: numeric ? null : obs.value,
        unit: obs.unit,
      };
    });
    const abnormalFlags = observations.map((o) => (o.abnormalFlag ?? '').toUpperCase());

    await this.reportService.create(trx, ctx, order.patientId, {
      encounterId: order.encounterId,
      orderId: order.id,
      codeSystem: reportCodeSystem,
      code: reportCode,
      displayName: reportDisplay ?? reportCode ?? 'Lab Result',
      criticalFlag: abnormalFlags.some((f) => CRITICAL_FLAGS.has(f)),
      abnormalFlag: abnormalFlags.some((f) => !NORMAL_FLAGS.has(f)),
      results,
    });

    await this.messageRepo.markProcessed(trx, ctx.tenantId, stored.id, actorId);
    return { ackCode: 'AA', messageId: stored.id };
  }
}
