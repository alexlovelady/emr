/**
 * Hand-mirrored string literals from `packages/db/src/seed-fixtures.ts`'s `PERMISSION_KEYS` — that
 * package can't be imported client-side. Used only for UX-level hide/disable decisions via
 * `usePermissions()`; the backend's own `@RequirePermission` is the real boundary.
 */
export const PERMISSION_KEYS = {
  ORGANIZATION_MANAGE: 'organization.manage',
  LOCATION_MANAGE: 'location.manage',
  PRACTITIONER_MANAGE: 'practitioner.manage',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  APPOINTMENT_MANAGE: 'appointment.manage',
  BILLING_RULE_MANAGE: 'billing_rule.manage',
  BANK_RECONCILIATION_MANAGE: 'bank_reconciliation.manage',
  ALERT_MANAGE: 'alert.manage',
  API_MANAGE_CLIENTS: 'api.manage_clients',
} as const;
