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
import { generateCcdXml } from './ccd-generator.js';
import { generateRecordsPdf } from './pdf-generator.js';
import type { ExportFormat } from './portal-export.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

const CONTENT_TYPES: Record<ExportFormat, string> = {
  json: 'application/json',
  pdf: 'application/pdf',
  'ccd-xml': 'application/xml',
};
const EXTENSIONS: Record<ExportFormat, string> = { json: 'json', pdf: 'pdf', 'ccd-xml': 'xml' };

/**
 * Fulfilled synchronously — no async job queue exists (same reasoning as Phase 4's FHIR
 * bulk-export deferral, migration `0031`'s doc comment). Item 25 closed the remaining "JSON only"
 * gap: `format` now also produces a real PDF clinical summary or a structurally real C-CDA (CCD)
 * XML document — see `pdf-generator.ts`/`ccd-generator.ts` for what each honestly does and doesn't
 * claim. `json` (the original, still the default) remains a plain dump of the same underlying data
 * for a caller that wants raw structured access rather than a human/interop document format.
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

  async requestExport(trx: Executor, ctx: RequestContext, patientId: string, format: ExportFormat = 'json'): Promise<{ request: ExportRequestRow; downloadUrl: string }> {
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

    const generatedAt = new Date();
    let body: string | Buffer;
    if (format === 'pdf') {
      body = await generateRecordsPdf({ generatedAt, patient, problems, allergies, medications, notes, results });
    } else if (format === 'ccd-xml') {
      const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', ctx.tenantId).executeTakeFirst();
      body = generateCcdXml({ generatedAt, custodianName: tenant?.name ?? 'Unknown organization', patient, problems, allergies, medications, results });
    } else {
      const bundle = { generatedAt: generatedAt.toISOString(), patient, problems, allergies, medications, notes, results };
      body = JSON.stringify(bundle, null, 2);
    }

    const { storageKey } = await this.storageGateway.putObject({
      tenantId: ctx.tenantId,
      filename: `patient-${patientId}-export-${Date.now()}.${EXTENSIONS[format]}`,
      contentType: CONTENT_TYPES[format],
      body,
    });

    const request = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      requestedByPortalAccountId: portalAccountId,
      storageKey,
      format,
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
