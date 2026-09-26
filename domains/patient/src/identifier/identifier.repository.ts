import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PatientIdentifierRow {
  id: string;
  tenantId: string;
  patientId: string;
  organizationId: string | null;
  identifierSystem: string;
  value: string;
  isPrimary: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class PatientIdentifierRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      organizationId: string | null;
      identifierSystem: string;
      value: string;
      isPrimary: boolean;
      createdBy: string;
    },
  ): Promise<PatientIdentifierRow> {
    const row = await trx
      .insertInto('patient_identifiers')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        organization_id: input.organizationId,
        identifier_system: input.identifierSystem,
        value: input.value,
        is_primary: input.isPrimary,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PatientIdentifierRow | null> {
    const row = await trx
      .selectFrom('patient_identifiers')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<PatientIdentifierRow[]> {
    const rows = await trx
      .selectFrom('patient_identifiers')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async reassignToPatient(trx: Executor, tenantId: string, id: string, newPatientId: string, updatedBy: string): Promise<PatientIdentifierRow> {
    const row = await trx
      .updateTable('patient_identifiers')
      .set({ patient_id: newPatientId, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['patient_identifiers']>): PatientIdentifierRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    organizationId: dbRow.organization_id,
    identifierSystem: dbRow.identifier_system,
    value: dbRow.value,
    isPrimary: dbRow.is_primary,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
