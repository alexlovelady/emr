/**
 * Injection token for the PaymentGateway implementation apps/api provides via DI. `@ehr/portal`
 * has its own identical-shaped token for the patient-initiated bill-pay flow — kept separate
 * rather than shared, since `@ehr/portal` already depends on `@ehr/payments` (for `LedgerService`)
 * and importing back the other way would create a cycle. Both tokens are wired to the same
 * `NoopPaymentGateway` instance in apps/api/src/core/core.module.ts.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
