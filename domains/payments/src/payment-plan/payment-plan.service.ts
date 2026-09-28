import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository } from '@ehr/patient';
import { PaymentPlanRepository, type PaymentPlanInstallmentRow, type PaymentPlanRow } from './payment-plan.repository.js';
import type { CreatePaymentPlanInput, PayInstallmentInput } from './payment-plan.dto.js';
import { PaymentService, type PaymentResult } from '../payment/payment.service.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface PaymentPlanWithInstallments {
  plan: PaymentPlanRow;
  installments: PaymentPlanInstallmentRow[];
}

/**
 * No async job queue/scheduler exists in this codebase — installments are never auto-charged on a
 * timer. `payInstallment` is the only way one gets marked paid, and it's always an explicit,
 * in-the-moment action (staff records it today, or a later phase lets a patient pay one via the
 * portal). See migration 0040's doc comment.
 */
export class PaymentPlanService {
  constructor(
    private readonly repo: PaymentPlanRepository = new PaymentPlanRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly paymentService: PaymentService,
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreatePaymentPlanInput): Promise<PaymentPlanWithInstallments> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const { plan, installments } = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      totalAmountCents: input.totalAmountCents,
      installmentCount: input.installmentCount,
      frequency: input.frequency,
      startDate: input.startDate,
      createdBy: actorId,
    });
    return { plan, installments };
  }

  async getWithInstallments(trx: Executor, ctx: RequestContext, planId: string): Promise<PaymentPlanWithInstallments> {
    const plan = await this.repo.findById(trx, ctx.tenantId, planId);
    if (!plan) throw new NotFoundError('Payment plan not found', { planId });
    const installments = await this.repo.listInstallments(trx, ctx.tenantId, planId);
    return { plan, installments };
  }

  async listByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<PaymentPlanRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async payInstallment(
    trx: Executor,
    ctx: RequestContext,
    planId: string,
    installmentId: string,
    input: PayInstallmentInput,
  ): Promise<{ installment: PaymentPlanInstallmentRow; payment: PaymentResult }> {
    const plan = await this.repo.findById(trx, ctx.tenantId, planId);
    if (!plan) throw new NotFoundError('Payment plan not found', { planId });

    const installment = await this.repo.findInstallmentById(trx, ctx.tenantId, installmentId);
    if (!installment || installment.paymentPlanId !== planId) throw new NotFoundError('Installment not found', { planId, installmentId });
    if (installment.status !== 'pending') {
      throw new ConflictError(`Installment is already ${installment.status}`, { installmentId, status: installment.status });
    }

    const amountCents = Math.round(Number(installment.amount) * 100);
    const payment = await this.paymentService.charge(
      trx,
      ctx,
      plan.patientId,
      {
        method: input.method,
        amountCents,
        currency: 'usd',
        paymentMethodToken: input.paymentMethodToken,
        bankAccountToken: input.bankAccountToken,
        referenceNumber: input.referenceNumber,
        description: `Payment plan ${plan.id} installment ${installment.sequenceNumber}/${plan.installmentCount}`,
      },
      { paymentPlanInstallmentId: installment.id },
    );

    if (payment.status !== 'succeeded' || !payment.ledgerEntry) {
      return { installment, payment };
    }

    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const updatedInstallment = await this.repo.markInstallmentPaid(trx, ctx.tenantId, installmentId, payment.ledgerEntry.id, actorId);

    const remaining = await this.repo.listInstallments(trx, ctx.tenantId, planId);
    if (remaining.every((i) => i.status === 'paid')) {
      await this.repo.updateStatus(trx, ctx.tenantId, planId, 'completed', actorId);
    }

    return { installment: updatedInstallment, payment };
  }
}
