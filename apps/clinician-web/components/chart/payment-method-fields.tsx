'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { PaymentMethod } from '@/lib/types';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Card',
  ach: 'ACH / bank transfer',
  cash: 'Cash',
  check: 'Check',
};

/**
 * Shared method selector + method-specific fields for both recording a one-off payment and paying
 * down a payment plan installment — card/ACH route through PaymentGateway (this dev environment has
 * no real processor, so any token value "succeeds"), cash/check never call a gateway at all.
 */
export function PaymentMethodFields({
  method,
  onMethodChange,
  paymentMethodToken,
  onPaymentMethodTokenChange,
  bankAccountToken,
  onBankAccountTokenChange,
  referenceNumber,
  onReferenceNumberChange,
}: {
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  paymentMethodToken: string;
  onPaymentMethodTokenChange: (value: string) => void;
  bankAccountToken: string;
  onBankAccountTokenChange: (value: string) => void;
  referenceNumber: string;
  onReferenceNumberChange: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="method">Payment method</Label>
        <Select value={method} onValueChange={(v) => onMethodChange(v as PaymentMethod)}>
          <SelectTrigger id="method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {method === 'card' && (
        <div className="space-y-1.5">
          <Label htmlFor="paymentMethodToken">Card token</Label>
          <Input
            id="paymentMethodToken"
            value={paymentMethodToken}
            onChange={(e) => onPaymentMethodTokenChange(e.target.value)}
            placeholder="tok_test"
            required
          />
          <p className="text-xs text-muted-foreground">
            No real card processor is connected — any token value here always succeeds.
          </p>
        </div>
      )}

      {method === 'ach' && (
        <div className="space-y-1.5">
          <Label htmlFor="bankAccountToken">Bank account token</Label>
          <Input
            id="bankAccountToken"
            value={bankAccountToken}
            onChange={(e) => onBankAccountTokenChange(e.target.value)}
            placeholder="bank_test"
            required
          />
          <p className="text-xs text-muted-foreground">
            No real ACH network is connected — any token value here always succeeds immediately
            (a real ACH debit can take days to settle).
          </p>
        </div>
      )}

      {method === 'check' && (
        <div className="space-y-1.5">
          <Label htmlFor="referenceNumber">Check number</Label>
          <Input
            id="referenceNumber"
            value={referenceNumber}
            onChange={(e) => onReferenceNumberChange(e.target.value)}
            placeholder="1042"
            required
          />
        </div>
      )}

      {method === 'cash' && (
        <p className="text-xs text-muted-foreground">Recorded immediately as already received — no processor is involved.</p>
      )}
    </>
  );
}
