import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import type { PrescribingGateway } from '@ehr/erx-adapter';
import type { InteractionCheckGateway, InteractionFinding } from '@ehr/interaction-adapter';
import { MedicationService } from '../medication/medication.service.js';
import { MedicationRepository } from '../medication/medication.repository.js';
import type { CreatePrescriptionInput } from './prescription.dto.js';
import {
  PrescriptionRepository,
  type PrescriptionRefillRequestRow,
  type PrescriptionRow,
} from './prescription.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TERMINAL_STATUSES = ['cancelled', 'completed', 'entered_in_error', 'rejected'];

/**
 * EHR_BUILD_SPEC.md §14's "eRx integration" (Phase 5), layered on top of Phase 3's medication
 * list the same way Phase 4's DiagnosticReportService layered on top of Observation: creating a
 * prescription also creates the underlying `medications` row in the same transaction.
 *
 * `expectedControlled` implements the two-route controlled-substance gate documented in
 * README.md's Phase 5 scope decisions: `PrescriptionController`'s ordinary route passes `false`,
 * its `/controlled` route (requiring the elevated `CONTROLLED_SUBSTANCE_PRESCRIBE` permission)
 * passes `true`. A payload/route mismatch is a 422, not a silent accept.
 */
export class PrescriptionService {
  constructor(
    private readonly gateway: PrescribingGateway,
    private readonly interactionGateway: InteractionCheckGateway,
    private readonly repo: PrescriptionRepository = new PrescriptionRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly medicationService: MedicationService = new MedicationService(),
    private readonly medicationRepo: MedicationRepository = new MedicationRepository(),
  ) {}

  async create(
    trx: Executor,
    ctx: RequestContext,
    patientId: string,
    input: CreatePrescriptionInput,
    expectedControlled: boolean,
  ): Promise<{ prescription: PrescriptionRow; interactionFindings: InteractionFinding[] }> {
    if (input.isControlledSubstance !== expectedControlled) {
      throw new ValidationError(
        expectedControlled
          ? 'Use the ordinary prescriptions endpoint for a non-controlled-substance prescription'
          : 'Use the /controlled prescriptions endpoint for a controlled-substance prescription',
        { isControlledSubstance: input.isControlledSubstance },
      );
    }

    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? null;

    const medication = await this.medicationService.create(trx, ctx, patientId, {
      encounterId: input.encounterId ?? null,
      medicationName: input.medicationName,
      rxnormCode: input.rxnormCode ?? null,
      dose: input.dose ?? null,
      route: input.route ?? null,
      frequency: input.frequency ?? null,
      sourceType: 'clinician_entered',
      startedAt: null,
      prescriberId: input.prescriberId,
      notes: null,
    });

    const interactionFindings = await this.checkInteractions(trx, ctx, patientId, medication.rxnormCode);

    const receipt = await this.gateway.sendPrescription({
      prescriptionId: medication.id,
      patientName: `${patient.givenName} ${patient.familyName}`,
      medicationName: input.medicationName,
      rxnormCode: input.rxnormCode ?? null,
      quantity: input.quantity,
      daysSupply: input.daysSupply ?? null,
      refillsAuthorized: input.refillsAuthorized,
      directions: input.directions,
      pharmacyNcpdpId: input.pharmacyNcpdpId,
      isControlledSubstance: input.isControlledSubstance,
      deaSchedule: input.deaSchedule ?? null,
    });

    const prescription = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      medicationId: medication.id,
      encounterId: input.encounterId ?? null,
      prescriberId: input.prescriberId,
      pharmacyNcpdpId: input.pharmacyNcpdpId,
      pharmacyName: input.pharmacyName,
      quantity: input.quantity,
      daysSupply: input.daysSupply ?? null,
      refillsAuthorized: input.refillsAuthorized,
      directions: input.directions,
      isControlledSubstance: input.isControlledSubstance,
      deaSchedule: input.deaSchedule ?? null,
      gatewayReferenceId: receipt.externalId,
      sentAt: receipt.transmittedAt,
      status: receipt.status === 'accepted' ? 'active' : 'rejected',
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, prescription, 'prescription.created.v1', {
      isControlledSubstance: prescription.isControlledSubstance,
      gatewayStatus: receipt.status,
    });

    return { prescription, interactionFindings };
  }

  /**
   * Real plumbing, honestly stubbed: gathers the patient's active-medication RxNorm codes (plus
   * the newly-prescribed one) and active-allergy codes, then calls the injected
   * `InteractionCheckGateway`. With the only implementation that exists today
   * (`NoopInteractionCheckGateway`) this always returns `[]` — see that class's doc comment for
   * why that must never be read as "checked, and it's clear." Queries `allergies` directly with
   * Kysely rather than going through `@ehr/clinical`'s `AllergyRepository`, since `@ehr/clinical`
   * already depends on `@ehr/medication` (for `MedicationService`) — importing it back here would
   * create a package cycle.
   */
  private async checkInteractions(
    trx: Executor,
    ctx: RequestContext,
    patientId: string,
    newMedicationRxnormCode: string | null,
  ): Promise<InteractionFinding[]> {
    const activeMedications = await this.medicationRepo.listActiveByPatient(trx, ctx.tenantId, patientId);
    const rxnormCodes = [...new Set([newMedicationRxnormCode, ...activeMedications.map((m) => m.rxnormCode)])].filter(
      (code): code is string => code !== null,
    );

    const activeAllergies = await trx
      .selectFrom('allergies')
      .select('code')
      .where('tenant_id', '=', ctx.tenantId)
      .where('patient_id', '=', patientId)
      .where('status', '=', 'active')
      .execute();
    const allergyCodes = activeAllergies.map((a) => a.code).filter((code): code is string => code !== null);

    return this.interactionGateway.checkInteractions({ rxnormCodes, allergyCodes });
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<PrescriptionRow> {
    const prescription = await this.repo.findById(trx, ctx.tenantId, id);
    if (!prescription) throw new NotFoundError('Prescription not found', { id });
    return prescription;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<PrescriptionRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async cancel(trx: Executor, ctx: RequestContext, id: string): Promise<PrescriptionRow> {
    const current = await this.getById(trx, ctx, id);
    if (TERMINAL_STATUSES.includes(current.status)) {
      throw new ConflictError(`Prescription is already ${current.status}`, { id, status: current.status });
    }
    if (current.gatewayReferenceId) {
      await this.gateway.cancelPrescription(current.gatewayReferenceId);
    }
    const actorId = ctx.actor?.id ?? null;
    const cancelled = await this.repo.setStatus(trx, ctx.tenantId, id, 'cancelled', actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, cancelled, 'prescription.cancelled.v1', {});
    return cancelled;
  }

  /**
   * Logs an incoming refill request — stands in for a real inbound NCPDP SCRIPT message (no
   * listener app for this phase; documented simplification, same class of deferral as Phase 4's
   * HTTP-instead-of-MLLP choice for HL7).
   */
  async requestRefill(trx: Executor, ctx: RequestContext, prescriptionId: string): Promise<PrescriptionRefillRequestRow> {
    const prescription = await this.getById(trx, ctx, prescriptionId);
    if (TERMINAL_STATUSES.includes(prescription.status)) {
      throw new ConflictError(`Cannot request a refill on a ${prescription.status} prescription`, { id: prescriptionId });
    }
    const actorId = ctx.actor?.id ?? null;
    const refillRequest = await this.repo.createRefillRequest(trx, {
      tenantId: ctx.tenantId,
      prescriptionId,
      createdBy: actorId ?? ctx.tenantId,
    });
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'prescription.refill_requested.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'prescription_refill_request',
          aggregate_id: refillRequest.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { prescriptionId },
        }),
      )
      .execute();
    return refillRequest;
  }

  async respondToRefill(
    trx: Executor,
    ctx: RequestContext,
    refillRequestId: string,
    input: { approved: boolean; denialReason: string | null },
  ): Promise<PrescriptionRefillRequestRow> {
    const refillRequest = await this.repo.findRefillRequestById(trx, ctx.tenantId, refillRequestId);
    if (!refillRequest) throw new NotFoundError('Refill request not found', { id: refillRequestId });
    if (refillRequest.status !== 'pending') {
      throw new ConflictError(`Refill request is already ${refillRequest.status}`, { id: refillRequestId });
    }

    const prescription = await this.getById(trx, ctx, refillRequest.prescriptionId);
    const actorId = ctx.actor?.id ?? null;
    const respondedBy = actorId ?? ctx.tenantId;

    if (input.approved) {
      if (prescription.gatewayReferenceId) {
        await this.gateway.refillResponse({
          externalId: prescription.gatewayReferenceId,
          approved: true,
          deniedReason: null,
        });
      }
      await this.repo.resetRefillsRemaining(trx, ctx.tenantId, prescription.id, prescription.refillsAuthorized, respondedBy);
      const updated = await this.repo.setRefillRequestStatus(trx, ctx.tenantId, refillRequestId, 'approved', respondedBy, null);
      await this.emitRefill(trx, ctx, updated, 'prescription.refill_approved.v1', {});
      return updated;
    }

    if (prescription.gatewayReferenceId) {
      await this.gateway.refillResponse({
        externalId: prescription.gatewayReferenceId,
        approved: false,
        deniedReason: input.denialReason ?? null,
      });
    }
    const updated = await this.repo.setRefillRequestStatus(
      trx,
      ctx.tenantId,
      refillRequestId,
      'denied',
      respondedBy,
      input.denialReason ?? null,
    );
    await this.emitRefill(trx, ctx, updated, 'prescription.refill_denied.v1', { denialReason: updated.denialReason });
    return updated;
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    prescription: PrescriptionRow,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'prescription',
          aggregate_id: prescription.id,
          aggregate_version: prescription.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }

  private async emitRefill(
    trx: Executor,
    ctx: RequestContext,
    refillRequest: PrescriptionRefillRequestRow,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'prescription_refill_request',
          aggregate_id: refillRequest.id,
          aggregate_version: refillRequest.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
