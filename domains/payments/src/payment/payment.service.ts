import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository } from '@ehr/patient';
import type { PaymentGateway } from '@ehr/payment-adapter';
import { LedgerService } from '../ledger/ledger.service.js';
import type { LedgerEntryRow } from '../ledger/ledger.repository.js';
import type { RecordPaymentInput } from './payment.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface PaymentResult {
  transactionId: string;
  status: 'succeeded' | 'pending' | 'failed';
  failureReason: string | null;
  ledgerEntry: LedgerEntryRow | null;
}

/**
 * The staff-facing (front-desk/billing) counterpart to `@ehr/portal`'s `PortalPaymentService` —
 * card/ACH go through `PaymentGateway`; cash/check never call it at all, since a staff member
 * recording one is attesting to an already-completed real-world event, not asking a processor to
 * move money. Kept as its own service rather than merged with the portal one: the two are gated by
 * different permission models (`RequirePermission` here, patient-self-service consent there) and
 * unifying them would mean reaching across that boundary for no real behavioral gain.
 */
export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly ledgerService: LedgerService = new LedgerService(),
  ) {}

  async charge(
    trx: Executor,
    ctx: RequestContext,
    patientId: string,
    input: RecordPaymentInput,
    opts: { paymentPlanInstallmentId?: string | null } = {},
  ): Promise<PaymentResult> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const { transactionId, status, failureReason } = await this.attempt(patientId, input);

    if (status === 'failed') {
      return { transactionId, status, failureReason, ledgerEntry: null };
    }

    const ledgerEntry = await this.ledgerService.postEntry(trx, ctx, {
      patientId,
      claimId: null,
      entryType: 'patient_payment',
      amount: (-(input.amountCents / 100)).toFixed(2),
      description: input.description ?? `Patient payment (${input.method}, transaction ${transactionId})`,
      paymentMethod: input.method,
      paymentReference: input.referenceNumber ?? null,
      paymentPlanInstallmentId: opts.paymentPlanInstallmentId ?? null,
    });

    return { transactionId, status, failureReason, ledgerEntry };
  }

  private async attempt(
    patientId: string,
    input: RecordPaymentInput,
  ): Promise<{ transactionId: string; status: 'succeeded' | 'pending' | 'failed'; failureReason: string | null }> {
    if (input.method === 'card') {
      if (!input.paymentMethodToken) throw new ValidationError('paymentMethodToken is required for card payments');
      return this.gateway.chargeCard({
        patientId,
        amountCents: input.amountCents,
        currency: input.currency,
        paymentMethodToken: input.paymentMethodToken,
      });
    }
    if (input.method === 'ach') {
      if (!input.bankAccountToken) throw new ValidationError('bankAccountToken is required for ACH payments');
      return this.gateway.chargeAch({
        patientId,
        amountCents: input.amountCents,
        currency: input.currency,
        bankAccountToken: input.bankAccountToken,
      });
    }
    // cash/check: already physically received — nothing to call, always "succeeded" by definition.
    return { transactionId: `manual-${input.method}-${randomUUID()}`, status: 'succeeded', failureReason: null };
  }
}
