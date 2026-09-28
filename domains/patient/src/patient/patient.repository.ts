import type { Kysely, Selectable, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '@ehr/db';
import type { FindDuplicatesQuery } from './patient.dto.js';

export interface PatientRow {
  id: string;
  tenantId: string;
  givenName: string;
  familyName: string;
  middleName: string | null;
  dateOfBirth: string;
  sexAtBirth: string | null;
  genderIdentity: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  preferredLanguage: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface DuplicateCandidate extends PatientRow {
  score: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export interface CreatePatientInput {
  tenantId: string;
  givenName: string;
  familyName: string;
  middleName: string | null;
  dateOfBirth: string;
  sexAtBirth: string | null;
  genderIdentity: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  preferredLanguage: string | null;
  createdBy: string;
}

export class PatientRepository {
  async create(trx: Executor, input: CreatePatientInput): Promise<PatientRow> {
    const row = await trx
      .insertInto('patients')
      .values({
        tenant_id: input.tenantId,
        given_name: input.givenName,
        family_name: input.familyName,
        middle_name: input.middleName,
        date_of_birth: input.dateOfBirth,
        sex_at_birth: input.sexAtBirth,
        gender_identity: input.genderIdentity,
        phone: input.phone,
        email: input.email,
        address_line1: input.addressLine1,
        address_line2: input.addressLine2,
        city: input.city,
        state: input.state,
        postal_code: input.postalCode,
        country: input.country,
        preferred_language: input.preferredLanguage,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PatientRow | null> {
    const row = await trx
      .selectFrom('patients')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string, filter: { since?: Date } = {}): Promise<PatientRow[]> {
    let query = trx.selectFrom('patients').selectAll().where('tenant_id', '=', tenantId);
    if (filter.since) query = query.where('updated_at', '>=', filter.since);
    const rows = await query.orderBy('created_at', 'asc').execute();
    return rows.map(toRow);
  }

  async updateContactInfo(
    trx: Executor,
    tenantId: string,
    id: string,
    patch: {
      phone?: string | null | undefined;
      email?: string | null | undefined;
      addressLine1?: string | null | undefined;
      addressLine2?: string | null | undefined;
      city?: string | null | undefined;
      state?: string | null | undefined;
      postalCode?: string | null | undefined;
      country?: string | null | undefined;
    },
    updatedBy: string,
  ): Promise<PatientRow> {
    const row = await trx
      .updateTable('patients')
      .set({
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.addressLine1 !== undefined ? { address_line1: patch.addressLine1 } : {}),
        ...(patch.addressLine2 !== undefined ? { address_line2: patch.addressLine2 } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.postalCode !== undefined ? { postal_code: patch.postalCode } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /** Name/DOB/sex/gender — unlike `updateContactInfo`, this DOES touch identity fields. See
   * `PatientService.updateDemographics()`'s doc comment for why that's a deliberate difference. */
  async updateDemographics(
    trx: Executor,
    tenantId: string,
    id: string,
    patch: {
      givenName?: string | undefined;
      familyName?: string | undefined;
      middleName?: string | null | undefined;
      dateOfBirth?: string | undefined;
      sexAtBirth?: string | null | undefined;
      genderIdentity?: string | null | undefined;
    },
    updatedBy: string,
  ): Promise<PatientRow> {
    const row = await trx
      .updateTable('patients')
      .set({
        ...(patch.givenName !== undefined ? { given_name: patch.givenName } : {}),
        ...(patch.familyName !== undefined ? { family_name: patch.familyName } : {}),
        ...(patch.middleName !== undefined ? { middle_name: patch.middleName } : {}),
        ...(patch.dateOfBirth !== undefined ? { date_of_birth: patch.dateOfBirth } : {}),
        ...(patch.sexAtBirth !== undefined ? { sex_at_birth: patch.sexAtBirth } : {}),
        ...(patch.genderIdentity !== undefined ? { gender_identity: patch.genderIdentity } : {}),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async setStatus(trx: Executor, tenantId: string, id: string, status: string, metadataPatch: Record<string, unknown>, updatedBy: string): Promise<PatientRow> {
    const row = await trx
      .updateTable('patients')
      .set({
        status,
        metadata: sql`metadata || ${JSON.stringify(metadataPatch)}::jsonb`,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /**
   * Deterministic duplicate scoring only (spec §5.3 — "no automatic patient merge without
   * configurable high-confidence rules and review"). Returns candidates sorted by score
   * descending; the caller decides whether/how to act, nothing here auto-merges.
   */
  async findDuplicateCandidates(
    trx: Executor,
    tenantId: string,
    criteria: FindDuplicatesQuery,
    excludePatientId?: string,
  ): Promise<DuplicateCandidate[]> {
    const conditions = [];
    if (criteria.dateOfBirth) conditions.push(sql`date_of_birth = ${criteria.dateOfBirth}`);
    if (criteria.givenName && criteria.familyName) {
      conditions.push(sql`(lower(given_name) = ${criteria.givenName.toLowerCase()} and lower(family_name) = ${criteria.familyName.toLowerCase()})`);
    }
    if (criteria.phone) conditions.push(sql`phone = ${criteria.phone}`);
    if (criteria.email) conditions.push(sql`lower(email) = ${criteria.email.toLowerCase()}`);
    if (conditions.length === 0) return [];

    let query = trx
      .selectFrom('patients')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where(sql<boolean>`(${sql.join(conditions, sql` or `)})`);
    if (excludePatientId) query = query.where('id', '!=', excludePatientId);

    const rows = await query.execute();
    return rows
      .map((row) => {
        const patient = toRow(row);
        let score = 0;
        if (criteria.dateOfBirth && patient.dateOfBirth === criteria.dateOfBirth) score += 40;
        if (
          criteria.givenName &&
          criteria.familyName &&
          patient.givenName.toLowerCase() === criteria.givenName.toLowerCase() &&
          patient.familyName.toLowerCase() === criteria.familyName.toLowerCase()
        ) {
          score += 30;
        }
        if (criteria.phone && patient.phone === criteria.phone) score += 20;
        if (criteria.email && patient.email?.toLowerCase() === criteria.email.toLowerCase()) score += 10;
        return { ...patient, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}

function toRow(dbRow: Selectable<DB['patients']>): PatientRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    givenName: dbRow.given_name,
    familyName: dbRow.family_name,
    middleName: dbRow.middle_name,
    dateOfBirth: formatDate(dbRow.date_of_birth),
    sexAtBirth: dbRow.sex_at_birth,
    genderIdentity: dbRow.gender_identity,
    phone: dbRow.phone,
    email: dbRow.email,
    addressLine1: dbRow.address_line1,
    addressLine2: dbRow.address_line2,
    city: dbRow.city,
    state: dbRow.state,
    postalCode: dbRow.postal_code,
    country: dbRow.country,
    preferredLanguage: dbRow.preferred_language,
    status: dbRow.status,
    metadata: dbRow.metadata,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

/** `date` columns come back from `pg` as a JS Date; normalize to a plain YYYY-MM-DD string. */
function formatDate(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}
