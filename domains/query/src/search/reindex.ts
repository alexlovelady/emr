import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { SearchIndexGateway } from '@ehr/search-adapter';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Full-scan-and-upsert reindexing for three representative resource types (spec §9 lists seven —
 * patient/MRN/contact, encounter/note text, document metadata, labs/results, task/referral, claim
 * identifiers, provider/location; wiring all seven is a documented gap, not silently skipped — see
 * README's Phase 7 scope decisions). Triggered by an admin action, not live on-write hooks.
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
