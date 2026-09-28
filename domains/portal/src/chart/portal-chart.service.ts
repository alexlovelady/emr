import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import { AppointmentService, type AppointmentRow } from '@ehr/scheduling';
import type { PortalBookAppointmentInput } from '../scheduling/portal-scheduling.dto.js';
import { DiagnosticReportRepository, type DiagnosticReportRow } from '@ehr/results';
import { NoteRepository, ProblemRepository, AllergyRepository, type NoteRow, type ProblemRow, type AllergyRow } from '@ehr/clinical';
import { MedicationRepository, type MedicationRow } from '@ehr/medication';
import { DocumentService, type DocumentRow } from '@ehr/documents';
import { LedgerService, type PatientLedger } from '@ehr/payments';
import type { ObjectStorageGateway } from '@ehr/object-storage';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Thin, read-only portal chart access. Every method calls `ConsentService.assertAccess` first,
 * then delegates straight to the same repositories/services staff use — reusing the *existing*
 * release-status columns (`diagnostic_reports.review_status`, `notes.status`) rather than
 * inventing a parallel "patient visibility" flag (EHR_BUILD_SPEC.md §17 / README's Phase 8 scope
 * decisions).
 */
export class PortalChartService {
  constructor(
    private readonly documentGateway: ObjectStorageGateway,
    private readonly consentService: ConsentService = new ConsentService(),
    private readonly appointmentService: AppointmentService = new AppointmentService(),
    private readonly diagnosticReportRepo: DiagnosticReportRepository = new DiagnosticReportRepository(),
    private readonly noteRepo: NoteRepository = new NoteRepository(),
    private readonly problemRepo: ProblemRepository = new ProblemRepository(),
    private readonly allergyRepo: AllergyRepository = new AllergyRepository(),
    private readonly medicationRepo: MedicationRepository = new MedicationRepository(),
    private readonly ledgerService: LedgerService = new LedgerService(),
  ) {}

  async listAppointments(trx: Executor, ctx: RequestContext, patientId: string): Promise<AppointmentRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    const appointments = await this.appointmentService.list(trx, ctx, { patientId });
    return appointments.map(stripPractitionerJoinUrl);
  }

  async bookAppointment(trx: Executor, ctx: RequestContext, patientId: string, input: PortalBookAppointmentInput): Promise<AppointmentRow> {
    await this.assertAccess(trx, ctx, patientId);
    const appointment = await this.appointmentService.create(trx, ctx, { patientId, ...input });
    return stripPractitionerJoinUrl(appointment);
  }

  /** Only ever cancels an appointment that both (a) the account has consent for and (b) actually
   * belongs to that exact patient — `getById` alone doesn't prove the second, since a portal
   * account could otherwise guess another patient's appointment id. */
  async cancelAppointment(trx: Executor, ctx: RequestContext, patientId: string, appointmentId: string, reason: string | null): Promise<AppointmentRow> {
    await this.assertAccess(trx, ctx, patientId);
    const appointment = await this.appointmentService.getById(trx, ctx, appointmentId);
    if (appointment.patientId !== patientId) throw new NotFoundError('Appointment not found', { appointmentId });
    const cancelled = await this.appointmentService.cancel(trx, ctx, appointmentId, reason);
    return stripPractitionerJoinUrl(cancelled);
  }

  async listResults(trx: Executor, ctx: RequestContext, patientId: string): Promise<DiagnosticReportRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    return this.diagnosticReportRepo.listReleasedByPatient(trx, ctx.tenantId, patientId);
  }

  async listNotes(trx: Executor, ctx: RequestContext, patientId: string): Promise<NoteRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    return this.noteRepo.listSignedByPatient(trx, ctx.tenantId, patientId);
  }

  async listProblems(trx: Executor, ctx: RequestContext, patientId: string): Promise<ProblemRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    return this.problemRepo.listActiveByPatient(trx, ctx.tenantId, patientId);
  }

  async listAllergies(trx: Executor, ctx: RequestContext, patientId: string): Promise<AllergyRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    return this.allergyRepo.listActiveByPatient(trx, ctx.tenantId, patientId);
  }

  async listMedications(trx: Executor, ctx: RequestContext, patientId: string): Promise<MedicationRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    return this.medicationRepo.listActiveByPatient(trx, ctx.tenantId, patientId);
  }

  async listDocuments(trx: Executor, ctx: RequestContext, patientId: string): Promise<DocumentRow[]> {
    await this.assertAccess(trx, ctx, patientId);
    const documentService = new DocumentService(this.documentGateway);
    return documentService.list(trx, ctx, { patientId });
  }

  async getLedger(trx: Executor, ctx: RequestContext, patientId: string): Promise<PatientLedger> {
    await this.assertAccess(trx, ctx, patientId);
    return this.ledgerService.getLedger(trx, ctx, patientId);
  }

  private async assertAccess(trx: Executor, ctx: RequestContext, patientId: string): Promise<void> {
    if (ctx.actor?.type !== 'patient') {
      // A staff (or other non-portal) token reaching here would be a misconfigured route, not a
      // legitimate caller — 404, matching ConsentService.assertAccess's own posture.
      throw new NotFoundError('Patient not found', { patientId });
    }
    await this.consentService.assertAccess(trx, ctx.tenantId, ctx.actor.id, patientId);
  }
}

/** The host-role video link is staff-only — a patient only ever needs their own participant link. */
function stripPractitionerJoinUrl(appointment: AppointmentRow): AppointmentRow {
  return { ...appointment, videoJoinUrlPractitioner: null };
}
