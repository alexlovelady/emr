import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import { PatientRepository } from '@ehr/patient';
import { ProblemRepository, AllergyRepository, NoteRepository } from '@ehr/clinical';
import { MedicationRepository } from '@ehr/medication';
import { DiagnosticReportRepository } from '@ehr/results';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { ExportRequestRepository, type ExportRequestRow } from './export-request.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Fulfilled synchronously — no async job queue exists (same reasoning as Phase 4's FHIR
 * bulk-export deferral, migration `0031`'s doc comment). Assembles a JSON bundle rather than a
 * full C-CDA/PDF — a documented trim of the delivery *format*, not the delivery mechanism: this is
 * a real, complete, downloadable record (demographics + active problems/allergies/medications +
 * signed notes + released results).
 */
export class PortalExportService {
  constructor(
    private readonly storageGateway: ObjectStorageGateway,
    private readonly repo: ExportRequestRepository = new ExportRequestRepository(),
    private readonly consentService: ConsentService = new ConsentService(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly problemRepo: ProblemRepository = new ProblemRepository(),
    private readonly allergyRepo: AllergyRepository = new AllergyRepository(),
    private readonly medicationRepo: MedicationRepository = new MedicationRepository(),
    private readonly noteRepo: NoteRepository = new NoteRepository(),
    private readonly diagnosticReportRepo: DiagnosticReportRepository = new DiagnosticReportRepository(),
  ) {}

  async requestExport(trx: Executor, ctx: RequestContext, patientId: string): Promise<{ request: ExportRequestRow; downloadUrl: string }> {
    const portalAccountId = requirePortalActorId(ctx);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, patientId);

    const [patient, problems, allergies, medications, notes, results] = await Promise.all([
      this.patientRepo.findById(trx, ctx.tenantId, patientId),
      this.problemRepo.listActiveByPatient(trx, ctx.tenantId, patientId),
      this.allergyRepo.listActiveByPatient(trx, ctx.tenantId, patientId),
      this.medicationRepo.listActiveByPatient(trx, ctx.tenantId, patientId),
      this.noteRepo.listSignedByPatient(trx, ctx.tenantId, patientId),
      this.diagnosticReportRepo.listReleasedByPatient(trx, ctx.tenantId, patientId),
    ]);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const bundle = { generatedAt: new Date().toISOString(), patient, problems, allergies, medications, notes, results };
    const { storageKey } = await this.storageGateway.putObject({
      tenantId: ctx.tenantId,
      filename: `patient-${patientId}-export-${Date.now()}.json`,
      contentType: 'application/json',
      body: JSON.stringify(bundle, null, 2),
    });

    const request = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      requestedByPortalAccountId: portalAccountId,
      storageKey,
      status: 'completed',
    });
    const downloadUrl = await this.storageGateway.getDownloadUrl({ storageKey });

    return { request, downloadUrl };
  }

  async listByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<ExportRequestRow[]> {
    const portalAccountId = requirePortalActorId(ctx);
    await this.consentService.assertAccess(trx, ctx.tenantId, portalAccountId, patientId);
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  /**
   * Scoped to the requester, not every proxy with access to the patient — an export bundle is a
   * standing PHI artifact in object storage; only the portal account that generated it gets the
   * link, a tighter bar than the read-only chart views above.
   */
  async getDownloadUrl(trx: Executor, ctx: RequestContext, exportRequestId: string): Promise<string> {
    const portalAccountId = requirePortalActorId(ctx);
    const request = await this.repo.findById(trx, ctx.tenantId, exportRequestId);
    if (!request || request.requestedByPortalAccountId !== portalAccountId || !request.storageKey) {
      throw new NotFoundError('Export request not found', { exportRequestId });
    }
    return this.storageGateway.getDownloadUrl({ storageKey: request.storageKey });
  }
}

function requirePortalActorId(ctx: RequestContext): string {
  if (ctx.actor?.type !== 'patient') {
    throw new NotFoundError('Patient not found');
  }
  return ctx.actor.id;
}
