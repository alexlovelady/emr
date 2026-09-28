import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { PatientRepository } from '@ehr/patient';
import { EncounterRepository, ObservationRepository, ProblemRepository, AllergyRepository } from '@ehr/clinical';
import { PrescriptionRepository, MedicationRepository } from '@ehr/medication';
import { DocumentRepository } from '@ehr/documents';
import {
  toFhirPatient,
  toFhirObservation,
  toFhirEncounter,
  toFhirCondition,
  toFhirAllergyIntolerance,
  toFhirMedicationRequest,
  toFhirDocumentReference,
} from '@ehr/fhir-mapping';
import { BulkExportJobRepository, type BulkExportOutputFile } from './bulk-export-job.repository.js';
import { toNdjson } from './ndjson.js';

/**
 * Node's `AggregateError` (e.g. a connection failure retried across multiple addresses, which is
 * exactly what an unreachable object-storage endpoint produces) has an empty top-level `.message`
 * — the real per-attempt messages live in `.errors[]`. Naive `err.message` extraction silently
 * records an empty string as the job's failure reason, which is worse than no error at all.
 */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ');
    return inner || err.message || err.name;
  }
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

export const BULK_EXPORT_RESOURCE_TYPES = [
  'Patient',
  'Observation',
  'Encounter',
  'Condition',
  'AllergyIntolerance',
  'MedicationRequest',
  'DocumentReference',
] as const;
export type BulkExportResourceType = (typeof BULK_EXPORT_RESOURCE_TYPES)[number];

export interface BulkExportRelayOptions {
  pollIntervalMs: number;
  /** e.g. `http://localhost:3200/fhir/r4` — needed only for DocumentReference's attachment URLs. */
  fhirBaseUrl: string;
}

/**
 * Polls `bulk_export_jobs` across ALL tenants, one at a time (unlike `OutboxRelay`'s batch — each
 * job here does real per-resource-type work, not a single row flip). Same trust-boundary rules as
 * `OutboxRelay`: constructed with a `Kysely<DB>` connected via the bootstrap/owner role
 * (DATABASE_URL), never `ehr_app` — see that class's own doc comment for the full reasoning, which
 * applies identically here. Every domain-repository call below still passes an explicit `tenantId`
 * (the same parameter those repos already require for `ehr_app`-connected callers) even though the
 * owner connection isn't RLS-scoped — belt-and-suspenders, not load-bearing.
 *
 * At-least-once: a crash mid-export leaves the job `in_progress` forever (no lease/heartbeat) —
 * acceptable for this repo's current scale (see `OutboxRelay`'s own retry-count-only posture);
 * revisit if this ever needs multiple worker replicas.
 */
export class BulkExportRelay {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  private readonly patientRepo = new PatientRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly encounterRepo = new EncounterRepository();
  private readonly problemRepo = new ProblemRepository();
  private readonly allergyRepo = new AllergyRepository();
  private readonly prescriptionRepo = new PrescriptionRepository();
  private readonly medicationRepo = new MedicationRepository();
  private readonly documentRepo = new DocumentRepository();
  private readonly jobRepo: BulkExportJobRepository;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly objectStorage: ObjectStorageGateway,
    private readonly options: BulkExportRelayOptions,
    jobRepo: BulkExportJobRepository = new BulkExportJobRepository(),
  ) {
    this.jobRepo = jobRepo;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => {
        console.error('[BulkExportRelay] tick failed, will retry next interval:', err);
      });
    }, this.options.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Processes at most one job. Exposed directly for tests and manual triggering. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const job = await this.jobRepo.claimNextPending(this.db);
      if (!job) return 0;

      try {
        const requestedTypes = (job.resourceTypes as BulkExportResourceType[] | null) ?? [...BULK_EXPORT_RESOURCE_TYPES];
        const outputFiles: BulkExportOutputFile[] = [];
        for (const type of requestedTypes) {
          const resources = await this.exportResourceType(type, job.tenantId, job.since);
          if (resources.length === 0) continue;
          const { storageKey } = await this.objectStorage.putObject({
            tenantId: job.tenantId,
            filename: `bulk-export-${job.id}-${type}.ndjson`,
            contentType: 'application/fhir+ndjson',
            body: toNdjson(resources),
          });
          outputFiles.push({ type, storageKey, count: resources.length });
        }
        await this.jobRepo.complete(this.db, job.tenantId, job.id, outputFiles);
      } catch (err) {
        await this.jobRepo.fail(this.db, job.tenantId, job.id, describeError(err));
      }
      return 1;
    } finally {
      this.running = false;
    }
  }

  private async exportResourceType(type: BulkExportResourceType, tenantId: string, since: Date | null): Promise<Record<string, unknown>[]> {
    const filter = since ? { since } : {};
    switch (type) {
      case 'Patient':
        return (await this.patientRepo.list(this.db, tenantId, filter)).map(toFhirPatient);
      case 'Observation':
        return (await this.observationRepo.listAll(this.db, tenantId, filter)).map(toFhirObservation);
      case 'Encounter':
        return (await this.encounterRepo.list(this.db, tenantId, filter)).map(toFhirEncounter);
      case 'Condition':
        return (await this.problemRepo.listAll(this.db, tenantId, filter)).map(toFhirCondition);
      case 'AllergyIntolerance':
        return (await this.allergyRepo.listAll(this.db, tenantId, filter)).map(toFhirAllergyIntolerance);
      case 'MedicationRequest': {
        const prescriptions = await this.prescriptionRepo.listAll(this.db, tenantId, filter);
        const resources: Record<string, unknown>[] = [];
        for (const prescription of prescriptions) {
          const medication = await this.medicationRepo.findById(this.db, tenantId, prescription.medicationId);
          if (medication) resources.push(toFhirMedicationRequest(prescription, medication));
        }
        return resources;
      }
      case 'DocumentReference': {
        const documents = await this.documentRepo.list(this.db, tenantId, filter);
        const documentReferenceUrl = `${this.options.fhirBaseUrl}/DocumentReference`;
        return documents.filter((d) => d.status === 'stored').map((d) => toFhirDocumentReference(d, documentReferenceUrl));
      }
    }
  }
}
