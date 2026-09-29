import { createHash } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';
import { peekMessageType, parseOruR01, parseAdtMessage, parseSiuMessage, parseOrmMessage, Hl7ParseError, Hl7PermanentProcessingError } from '@ehr/hl7';
import { OrderRepository, OrderService } from '@ehr/orders';
import { NoopLabOrderGateway } from '@ehr/lab-adapter';
import { DiagnosticReportService, type CreateDiagnosticReportInput } from '@ehr/results';
import { PatientRepository, PatientService } from '@ehr/patient';
import { AppointmentRepository, AppointmentService } from '@ehr/scheduling';
import { EncounterRepository } from '@ehr/clinical';
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
 * `Hl7ParseError`/`Hl7PermanentProcessingError` mean resending the exact same bytes will never
 * succeed (malformed message, or no matching order/patient/appointment/encounter) — those are
 * dead-lettered immediately. Anything else is an unexpected exception, most plausibly a transient
 * database/connectivity failure, so it defaults to retryable — see `Hl7RetryRelay`.
 */
function isRetryableFailure(err: unknown): boolean {
  return !(err instanceof Hl7ParseError || err instanceof Hl7PermanentProcessingError);
}

/** The very first scheduled retry's delay, when a brand-new message fails synchronously during
 * `ingest()` — matches `HL7_RETRY_BACKOFF_BASE_MS`'s own config default. Every SUBSEQUENT attempt
 * made by `Hl7RetryRelay` uses the live configured value (passed explicitly to
 * `Hl7MessageRepository.recordRetryFailure`), so only this one first-failure delay is fixed rather
 * than configurable — deliberately simple rather than threading config through this service's
 * Nest-DI-friendly zero-arg construction (every other constructor parameter here is a plain
 * default-valued dependency, not environment config). */
const INITIAL_RETRY_BACKOFF_MS = 60_000;

/**
 * EHR_BUILD_SPEC.md §12.1's pipeline: "Listener -> raw immutable message store -> parse ->
 * validate -> route -> transform -> canonical staging -> reconciliation/idempotency -> commit ->
 * ACK/NACK -> event." Phase 4 only implemented ORU^R01; the eCW/athena parity roadmap's Phase J
 * added ADT (A01/A02/A03/A08), SIU (S12/S14/S15), and ORM (O01) dispatch — `ingest()` peeks the
 * message type first (cheap, doesn't validate type-specific content), checks idempotency using the
 * REAL message control id as soon as it's known (not a content hash — that fallback is now only
 * for messages with no usable MSH at all), then dispatches to one `process*` method per type. Every
 * `process*` method throws a plain `Error` (or a domain error) on any failure — a single catch
 * around the dispatch marks the already-created message row failed and returns a clean NACK,
 * instead of each branch duplicating that logic.
 *
 * Every new-domain-object correlation below (ADT's patient identifier, SIU's practitioner/location/
 * placer-appointment id, ORM's encounter/ordering-practitioner id) is a raw UUID from THIS system,
 * not an external identifier — see `@ehr/hl7`'s `adt.ts`/`siu.ts`/`orm.ts` doc comments for why:
 * the same convention `oru-r01.ts` already established for its placer-order-number correlation
 * (no real external interface partner exists to test a genuine MRN/id crosswalk against).
 */
export class Hl7IngestionService {
  constructor(
    private readonly messageRepo: Hl7MessageRepository = new Hl7MessageRepository(),
    private readonly orderRepo: OrderRepository = new OrderRepository(),
    private readonly reportService: DiagnosticReportService = new DiagnosticReportService(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly patientService: PatientService = new PatientService(),
    private readonly appointmentRepo: AppointmentRepository = new AppointmentRepository(),
    private readonly appointmentService: AppointmentService = new AppointmentService(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
    private readonly orderService: OrderService = new OrderService(new NoopLabOrderGateway()),
  ) {}

  async ingest(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<Hl7IngestResult> {
    const actorId = ctx.actor?.id ?? ctx.tenantId;

    let peeked: { messageType: string; triggerEvent: string; messageControlId: string };
    try {
      peeked = peekMessageType(rawMessage);
    } catch (err) {
      // No usable MSH at all — nothing real to key idempotency on, fall back to a content hash.
      // The raw message is still stored, never discarded, per spec §12.1.
      const messageControlId = `unparseable-${createHash('sha256').update(rawMessage).digest('hex').slice(0, 16)}`;
      const existing = await this.messageRepo.findByControlId(trx, ctx.tenantId, messageControlId);
      if (existing) return { ackCode: 'AE', messageId: existing.id, ...(existing.parseError ? { detail: existing.parseError } : {}) };

      const detail = err instanceof Error ? err.message : String(err);
      const stored = await this.messageRepo.create(trx, { tenantId: ctx.tenantId, messageControlId, messageType: 'UNKNOWN', rawMessage, createdBy: actorId });
      await this.messageRepo.markFailed(trx, ctx.tenantId, stored.id, detail, actorId);
      return { ackCode: 'AE', messageId: stored.id, detail };
    }

    const { messageControlId } = peeked;
    const messageTypeKey = `${peeked.messageType}^${peeked.triggerEvent}`;

    const existing = await this.messageRepo.findByControlId(trx, ctx.tenantId, messageControlId);
    if (existing) {
      // Idempotent redelivery (spec §12.1) — never reprocess a message control ID we've already stored.
      return {
        ackCode: existing.status === 'failed' ? 'AE' : 'AA',
        messageId: existing.id,
        ...(existing.parseError ? { detail: existing.parseError } : {}),
      };
    }

    const stored = await this.messageRepo.create(trx, { tenantId: ctx.tenantId, messageControlId, messageType: messageTypeKey, rawMessage, createdBy: actorId });

    try {
      await this.dispatch(trx, ctx, messageTypeKey, rawMessage);
    } catch (err) {
      const retryable = isRetryableFailure(err);
      const detail = err instanceof Error ? err.message : String(err);
      await this.messageRepo.markFailed(trx, ctx.tenantId, stored.id, detail, actorId, {
        retryable,
        backoffMs: INITIAL_RETRY_BACKOFF_MS,
      });
      return { ackCode: 'AE', messageId: stored.id, detail };
    }

    await this.messageRepo.markProcessed(trx, ctx.tenantId, stored.id, actorId);
    return { ackCode: 'AA', messageId: stored.id };
  }

  /**
   * Re-runs the same dispatch `ingest()` uses, against an EXISTING stored row — what
   * `Hl7RetryRelay` calls for a message previously classified as a transient failure. Deliberately
   * does not touch `hl7_messages` itself (no idempotency re-check, no status write); the relay owns
   * recording the outcome via `Hl7MessageRepository.recordRetryFailure`/`markProcessed`, since it
   * also needs to compute the next backoff or dead-letter the row.
   */
  async reprocess(trx: Executor, ctx: RequestContext, messageTypeKey: string, rawMessage: string): Promise<void> {
    await this.dispatch(trx, ctx, messageTypeKey, rawMessage);
  }

  private async dispatch(trx: Executor, ctx: RequestContext, messageTypeKey: string, rawMessage: string): Promise<void> {
    switch (messageTypeKey) {
      case 'ORU^R01':
        return this.processOru(trx, ctx, rawMessage);
      case 'ADT^A01':
      case 'ADT^A02':
      case 'ADT^A03':
      case 'ADT^A08':
        return this.processAdt(trx, ctx, rawMessage);
      case 'SIU^S12':
        return this.processSiuNew(trx, ctx, rawMessage);
      case 'SIU^S14':
        return this.processSiuUpdate(trx, ctx, rawMessage);
      case 'SIU^S15':
        return this.processSiuCancel(trx, ctx, rawMessage);
      case 'ORM^O01':
        return this.processOrm(trx, ctx, rawMessage);
      default:
        throw new Hl7ParseError(`Unsupported message type: ${messageTypeKey}`);
    }
  }

  private async processOru(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<void> {
    const parsed = parseOruR01(rawMessage);

    if (!parsed.placerOrderNumber) {
      throw new Hl7PermanentProcessingError('Missing OBR-2 (placer order number) — cannot correlate this result to an order');
    }
    const order = await this.orderRepo.findById(trx, ctx.tenantId, parsed.placerOrderNumber);
    if (!order) throw new Hl7PermanentProcessingError(`No order found matching placer order number ${parsed.placerOrderNumber}`);

    const results: CreateDiagnosticReportInput['results'] = parsed.observations.map((obs) => {
      const numeric = obs.value !== null && obs.value !== '' && !Number.isNaN(Number(obs.value));
      return {
        code: obs.code ?? 'unknown',
        display: obs.display ?? obs.code ?? 'Result',
        valueQuantity: numeric ? Number(obs.value) : null,
        valueText: numeric ? null : obs.value,
        unit: obs.unit,
      };
    });
    const abnormalFlags = parsed.observations.map((o) => (o.abnormalFlag ?? '').toUpperCase());

    await this.reportService.create(trx, ctx, order.patientId, {
      encounterId: order.encounterId,
      orderId: order.id,
      codeSystem: parsed.reportCodeSystem,
      code: parsed.reportCode,
      displayName: parsed.reportDisplay ?? parsed.reportCode ?? 'Lab Result',
      criticalFlag: abnormalFlags.some((f) => CRITICAL_FLAGS.has(f)),
      abnormalFlag: abnormalFlags.some((f) => !NORMAL_FLAGS.has(f)),
      results,
    });
  }

  private async processAdt(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<void> {
    const parsed = parseAdtMessage(rawMessage);
    if (!parsed.patientIdentifier) throw new Hl7PermanentProcessingError('Missing PID-3 (patient identifier)');

    const patient = await this.patientRepo.findById(trx, ctx.tenantId, parsed.patientIdentifier);
    if (!patient) throw new Hl7PermanentProcessingError(`No patient found matching identifier ${parsed.patientIdentifier}`);

    await this.patientService.updateDemographics(trx, ctx, patient.id, {
      ...(parsed.givenName ? { givenName: parsed.givenName } : {}),
      ...(parsed.familyName ? { familyName: parsed.familyName } : {}),
      ...(parsed.middleName !== null ? { middleName: parsed.middleName } : {}),
      ...(parsed.dateOfBirth ? { dateOfBirth: parsed.dateOfBirth } : {}),
      ...(parsed.sexAtBirth !== null ? { sexAtBirth: parsed.sexAtBirth } : {}),
    });
  }

  private async processSiuNew(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<void> {
    const parsed = parseSiuMessage(rawMessage);
    if (!parsed.patientIdentifier) throw new Hl7PermanentProcessingError('Missing PID-3 (patient identifier)');
    if (!parsed.practitionerId) throw new Hl7PermanentProcessingError('Missing AIP-3 (practitioner resource id)');
    if (!parsed.locationId) throw new Hl7PermanentProcessingError('Missing AIL-3 (location resource id)');
    if (!parsed.scheduledStart || !parsed.scheduledEnd) throw new Hl7PermanentProcessingError('Missing or invalid SCH-11 (appointment timing)');

    const patient = await this.patientRepo.findById(trx, ctx.tenantId, parsed.patientIdentifier);
    if (!patient) throw new Hl7PermanentProcessingError(`No patient found matching identifier ${parsed.patientIdentifier}`);

    await this.appointmentService.create(trx, ctx, {
      patientId: patient.id,
      locationId: parsed.locationId,
      practitionerId: parsed.practitionerId,
      appointmentType: parsed.appointmentType ?? 'office_visit',
      scheduledStart: parsed.scheduledStart,
      scheduledEnd: parsed.scheduledEnd,
    });
  }

  private async processSiuUpdate(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<void> {
    const parsed = parseSiuMessage(rawMessage);
    if (!parsed.placerAppointmentId) {
      throw new Hl7PermanentProcessingError('Missing SCH-1 (placer appointment id) — cannot correlate this update to an appointment');
    }
    if (!parsed.scheduledStart || !parsed.scheduledEnd) throw new Hl7PermanentProcessingError('Missing or invalid SCH-11 (appointment timing)');

    const appointment = await this.appointmentRepo.findById(trx, ctx.tenantId, parsed.placerAppointmentId);
    if (!appointment) throw new Hl7PermanentProcessingError(`No appointment found matching placer appointment id ${parsed.placerAppointmentId}`);

    await this.appointmentService.reschedule(trx, ctx, appointment.id, {
      scheduledStart: parsed.scheduledStart,
      scheduledEnd: parsed.scheduledEnd,
    });
  }

  private async processSiuCancel(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<void> {
    const parsed = parseSiuMessage(rawMessage);
    if (!parsed.placerAppointmentId) {
      throw new Hl7PermanentProcessingError('Missing SCH-1 (placer appointment id) — cannot correlate this cancellation to an appointment');
    }

    const appointment = await this.appointmentRepo.findById(trx, ctx.tenantId, parsed.placerAppointmentId);
    if (!appointment) throw new Hl7PermanentProcessingError(`No appointment found matching placer appointment id ${parsed.placerAppointmentId}`);

    await this.appointmentService.cancel(trx, ctx, appointment.id, 'Cancelled via HL7 SIU message');
  }

  private async processOrm(trx: Executor, ctx: RequestContext, rawMessage: string): Promise<void> {
    const parsed = parseOrmMessage(rawMessage);
    if (!parsed.encounterId) throw new Hl7PermanentProcessingError('Missing PV1-19 (visit number) — cannot correlate this order to an encounter');
    if (!parsed.orderingPractitionerId) throw new Hl7PermanentProcessingError('Missing OBR-16 (ordering provider)');

    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, parsed.encounterId);
    if (!encounter) throw new Hl7PermanentProcessingError(`No encounter found matching visit number ${parsed.encounterId}`);

    await this.orderService.create(trx, ctx, {
      encounterId: encounter.id,
      orderingPractitionerId: parsed.orderingPractitionerId,
      orderType: 'lab',
      codeSystem: parsed.codeSystem,
      code: parsed.code,
      displayName: parsed.displayName ?? parsed.code ?? 'Order',
      priority: 'routine',
    });
  }
}
