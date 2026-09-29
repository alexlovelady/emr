import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { SearchIndexGateway } from '@ehr/search-adapter';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Full-scan-and-upsert reindexing, now covering all seven resource types spec §9 lists: patient/
 * MRN/contact, encounter/note text, document metadata, labs/results, task/referral, claim
 * identifiers, provider/location. Triggered by an admin action, not live on-write hooks (still a
 * documented simplification — see README's Phase 7 scope decisions — but the resource-type
 * coverage gap itself is closed).
 */
export async function reindexPatients(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const patients = await trx.selectFrom('patients').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const patient of patients) {
    const identifiers = await trx
      .selectFrom('patient_identifiers')
      .select(['identifier_system', 'value'])
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patient.id)
      .execute();
    const identifierText = identifiers.map((i) => `${i.identifier_system}:${i.value}`).join(' ');

    await gateway.indexDocument(trx, {
      tenantId,
      patientId: patient.id,
      resourceType: 'Patient',
      resourceId: patient.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: `${patient.given_name} ${patient.family_name}`,
      body: [patient.phone, patient.email, identifierText].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return patients.length;
}

export async function reindexDocuments(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const documents = await trx.selectFrom('documents').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const document of documents) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: document.patient_id,
      resourceType: 'Document',
      resourceId: document.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: document.filename,
      body: [document.content_type, document.document_category].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return documents.length;
}

export async function reindexClaims(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const claims = await trx.selectFrom('claims').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const claim of claims) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: claim.patient_id,
      resourceType: 'Claim',
      resourceId: claim.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: `Claim ${claim.id}`,
      body: [claim.clearinghouse_transaction_id, `status:${claim.status}`].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return claims.length;
}

export async function reindexNotes(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const notes = await trx.selectFrom('notes').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const note of notes) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: note.patient_id,
      resourceType: 'Note',
      resourceId: note.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: note.note_type.replace(/_/g, ' '),
      body: Object.values(note.content ?? {}).join(' '),
    });
  }

  return notes.length;
}

export async function reindexDiagnosticReports(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const reports = await trx.selectFrom('diagnostic_reports').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const report of reports) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: report.patient_id,
      resourceType: 'DiagnosticReport',
      resourceId: report.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: report.display_name,
      body: [report.code, report.conclusion, report.performing_lab].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return reports.length;
}

export async function reindexTasks(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const tasks = await trx.selectFrom('tasks').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const task of tasks) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: task.patient_id,
      resourceType: 'Task',
      resourceId: task.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: task.title,
      body: [task.description, task.task_type, `status:${task.status}`].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return tasks.length;
}

export async function reindexReferrals(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const referrals = await trx.selectFrom('referrals').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const referral of referrals) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: referral.patient_id,
      resourceType: 'Referral',
      resourceId: referral.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: `Referral: ${referral.specialty}`,
      body: [referral.reason, referral.external_provider_name, `status:${referral.status}`].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return referrals.length;
}

/** Providers/locations have no `patient_id` — always indexed with `patientId: null`, same as any
 * tenant-wide (not patient-scoped) resource this index will ever carry. */
export async function reindexPractitioners(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const practitioners = await trx.selectFrom('practitioners').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const practitioner of practitioners) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: null,
      resourceType: 'Practitioner',
      resourceId: practitioner.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: practitioner.display_name,
      body: [practitioner.npi, practitioner.taxonomy_code].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return practitioners.length;
}

export async function reindexLocations(trx: Executor, tenantId: string, gateway: SearchIndexGateway): Promise<number> {
  const locations = await trx.selectFrom('locations').selectAll().where('tenant_id', '=', tenantId).execute();

  for (const location of locations) {
    await gateway.indexDocument(trx, {
      tenantId,
      patientId: null,
      resourceType: 'Location',
      resourceId: location.id,
      sensitivityTags: [],
      allowedContextTags: [],
      title: location.name,
      body: [location.address_line1, location.city, location.state].filter((v): v is string => Boolean(v)).join(' '),
    });
  }

  return locations.length;
}
