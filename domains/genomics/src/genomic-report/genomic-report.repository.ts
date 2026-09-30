import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface GenomicReportRow {
  id: string;
  tenantId: string;
  orderId: string | null;
  patientId: string;
  encounterId: string;
  codeSystem: string | null;
  code: string | null;
  displayName: string;
  conclusion: string | null;
  performingLab: string | null;
  issuedAt: Date;
  reviewStatus: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  amendsReportId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface GenomicFindingRow {
  id: string;
  tenantId: string;
  genomicReportId: string;
  geneSymbol: string;
  hgvsNotation: string | null;
  variantDisplay: string | null;
  clinicalSignificance: string | null;
  phenotypeCategory: string | null;
  interpretation: string | null;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class GenomicReportRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      orderId: string | null;
      patientId: string;
      encounterId: string;
      codeSystem: string | null;
      code: string | null;
      displayName: string;
      conclusion: string | null;
      performingLab: string | null;
      amendsReportId: string | null;
      createdBy: string;
    },
  ): Promise<GenomicReportRow> {
    const row = await trx
      .insertInto('genomic_reports')
      .values({
        tenant_id: input.tenantId,
        order_id: input.orderId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        code_system: input.codeSystem,
        code: input.code,
        display_name: input.displayName,
        conclusion: input.conclusion,
        performing_lab: input.performingLab,
        amends_report_id: input.amendsReportId,
        status: 'final',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<GenomicReportRow | null> {
    const row = await trx.selectFrom('genomic_reports').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<GenomicReportRow[]> {
    const rows = await trx
      .selectFrom('genomic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('issued_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  /** Portal-visible results (`@ehr/portal`) — excludes `'pending'`, same gate as `diagnostic_reports`. */
  async listReleasedByPatient(trx: Executor, tenantId: string, patientId: string): Promise<GenomicReportRow[]> {
    const rows = await trx
      .selectFrom('genomic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .where('review_status', 'in', ['reviewed', 'acknowledged'])
      .orderBy('issued_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async listInbox(trx: Executor, tenantId: string): Promise<GenomicReportRow[]> {
    const rows = await trx
      .selectFrom('genomic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('review_status', '=', 'pending')
      .orderBy('issued_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async markReviewed(trx: Executor, tenantId: string, id: string, reviewStatus: string, reviewedBy: string): Promise<GenomicReportRow> {
    const row = await trx
      .updateTable('genomic_reports')
      .set({ review_status: reviewStatus, reviewed_at: new Date(), reviewed_by: reviewedBy, updated_by: reviewedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async createFinding(
    trx: Executor,
    input: {
      tenantId: string;
      genomicReportId: string;
      geneSymbol: string;
      hgvsNotation: string | null;
      variantDisplay: string | null;
      clinicalSignificance: string | null;
      phenotypeCategory: string | null;
      interpretation: string | null;
      createdBy: string;
    },
  ): Promise<GenomicFindingRow> {
    const row = await trx
      .insertInto('genomic_findings')
      .values({
        tenant_id: input.tenantId,
        genomic_report_id: input.genomicReportId,
        gene_symbol: input.geneSymbol,
        hgvs_notation: input.hgvsNotation,
        variant_display: input.variantDisplay,
        clinical_significance: input.clinicalSignificance,
        phenotype_category: input.phenotypeCategory,
        interpretation: input.interpretation,
        status: 'final',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toFindingRow(row);
  }

  async listFindings(trx: Executor, tenantId: string, genomicReportId: string): Promise<GenomicFindingRow[]> {
    const rows = await trx
      .selectFrom('genomic_findings')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('genomic_report_id', '=', genomicReportId)
      .execute();
    return rows.map(toFindingRow);
  }
}

function toRow(dbRow: Selectable<DB['genomic_reports']>): GenomicReportRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    orderId: dbRow.order_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    displayName: dbRow.display_name,
    conclusion: dbRow.conclusion,
    performingLab: dbRow.performing_lab,
    issuedAt: dbRow.issued_at,
    reviewStatus: dbRow.review_status,
    reviewedAt: dbRow.reviewed_at,
    reviewedBy: dbRow.reviewed_by,
    amendsReportId: dbRow.amends_report_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function toFindingRow(dbRow: Selectable<DB['genomic_findings']>): GenomicFindingRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    genomicReportId: dbRow.genomic_report_id,
    geneSymbol: dbRow.gene_symbol,
    hgvsNotation: dbRow.hgvs_notation,
    variantDisplay: dbRow.variant_display,
    clinicalSignificance: dbRow.clinical_significance,
    phenotypeCategory: dbRow.phenotype_category,
    interpretation: dbRow.interpretation,
  };
}
