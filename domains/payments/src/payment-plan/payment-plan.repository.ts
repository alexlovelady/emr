import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

type Executor = Kysely<DB> | Transaction<DB>;

export interface PaymentPlanRow {
  id: string;
  tenantId: string;
  patientId: string;
  totalAmount: string;
  installmentAmount: string;
  installmentCount: number;
  frequency: string;
  startDate: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PaymentPlanInstallmentRow {
  id: string;
  tenantId: string;
  paymentPlanId: string;
  sequenceNumber: number;
  dueDate: string;
  amount: string;
  status: string;
  paidLedgerEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class PaymentPlanRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      totalAmountCents: number;
      installmentCount: number;
      frequency: 'weekly' | 'biweekly' | 'monthly';
      startDate: string;
      createdBy: string;
    },
  ): Promise<{ plan: PaymentPlanRow; installments: PaymentPlanInstallmentRow[] }> {
    const perInstallmentCents = Math.floor(input.totalAmountCents / input.installmentCount);
    const lastInstallmentCents = input.totalAmountCents - perInstallmentCents * (input.installmentCount - 1);

    const planRow = await trx
      .insertInto('payment_plans')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        total_amount: (input.totalAmountCents / 100).toFixed(2),
        installment_amount: (perInstallmentCents / 100).toFixed(2),
        installment_count: input.installmentCount,
        frequency: input.frequency,
        start_date: input.startDate,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const dueDates = buildDueDates(input.startDate, input.installmentCount, input.frequency);
    const installments = await trx
      .insertInto('payment_plan_installments')
      .values(
        dueDates.map((dueDate, index) => ({
          tenant_id: input.tenantId,
          payment_plan_id: planRow.id,
          sequence_number: index + 1,
          due_date: dueDate,
          amount: ((index === input.installmentCount - 1 ? lastInstallmentCents : perInstallmentCents) / 100).toFixed(2),
          status: 'pending',
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })),
      )
      .returningAll()
      .execute();

    return { plan: toPlanRow(planRow), installments: installments.map(toInstallmentRow) };
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PaymentPlanRow | null> {
    const row = await trx.selectFrom('payment_plans').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toPlanRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<PaymentPlanRow[]> {
    const rows = await trx
      .selectFrom('payment_plans')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toPlanRow);
  }

  async listInstallments(trx: Executor, tenantId: string, paymentPlanId: string): Promise<PaymentPlanInstallmentRow[]> {
    const rows = await trx
      .selectFrom('payment_plan_installments')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('payment_plan_id', '=', paymentPlanId)
      .orderBy('sequence_number', 'asc')
      .execute();
    return rows.map(toInstallmentRow);
  }

  async findInstallmentById(trx: Executor, tenantId: string, id: string): Promise<PaymentPlanInstallmentRow | null> {
    const row = await trx.selectFrom('payment_plan_installments').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toInstallmentRow(row) : null;
  }

  async markInstallmentPaid(trx: Executor, tenantId: string, installmentId: string, paidLedgerEntryId: string, updatedBy: string): Promise<PaymentPlanInstallmentRow> {
    const row = await trx
      .updateTable('payment_plan_installments')
      .set({ status: 'paid', paid_ledger_entry_id: paidLedgerEntryId, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', installmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toInstallmentRow(row);
  }

  async updateStatus(trx: Executor, tenantId: string, planId: string, status: string, updatedBy: string): Promise<PaymentPlanRow> {
    const row = await trx
      .updateTable('payment_plans')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', planId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toPlanRow(row);
  }
}

/** Simple fixed-cadence schedule — not a full calendar/billing-cycle engine. Monthly advances by
 * calendar month (so day-of-month drifts around short months exactly like a real due-on-the-5th
 * billing cycle would); weekly/biweekly are flat day offsets. */
function buildDueDates(startDate: string, count: number, frequency: 'weekly' | 'biweekly' | 'monthly'): string[] {
  const [year, month, day] = startDate.split('-').map(Number);
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(year!, month! - 1, day!));
    if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + i * 7);
    else if (frequency === 'biweekly') d.setUTCDate(d.getUTCDate() + i * 14);
    else d.setUTCMonth(d.getUTCMonth() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function toPlanRow(dbRow: Selectable<DB['payment_plans']>): PaymentPlanRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    totalAmount: dbRow.total_amount,
    installmentAmount: dbRow.installment_amount,
    installmentCount: Number(dbRow.installment_count),
    frequency: dbRow.frequency,
    startDate: formatDate(dbRow.start_date),
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function toInstallmentRow(dbRow: Selectable<DB['payment_plan_installments']>): PaymentPlanInstallmentRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    paymentPlanId: dbRow.payment_plan_id,
    sequenceNumber: Number(dbRow.sequence_number),
    dueDate: formatDate(dbRow.due_date),
    amount: dbRow.amount,
    status: dbRow.status,
    paidLedgerEntryId: dbRow.paid_ledger_entry_id,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function formatDate(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}
