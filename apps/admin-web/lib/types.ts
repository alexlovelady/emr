/**
 * Hand-written to match the real JSON shapes `apps/api` returns over HTTP (dates arrive as ISO
 * strings, not `Date`) — nothing in the backend is safe to import into a browser bundle. See
 * docs/adr/0006-clinician-web-bff-auth.md.
 */

export interface CurrentUser {
  id: string;
  tenantId: string;
  email: string;
  status: string;
  mfaEnrolled: boolean;
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export interface EffectivePermissions {
  permissions: string[];
}

export interface OrganizationRow {
  id: string;
  name: string;
  npi: string | null;
  status: string;
  createdAt: string;
}

export interface LocationRow {
  id: string;
  organizationId: string;
  name: string;
  timeZone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: string;
  createdAt: string;
}

export interface ResourceRow {
  id: string;
  locationId: string;
  name: string;
  resourceType: string;
}

export type BillingRuleType = 'code_requires_diagnosis_prefix' | 'code_forbidden_for_sex' | 'code_max_units';

export interface BillingRuleRow {
  id: string;
  ruleType: BillingRuleType;
  description: string;
  parameters: Record<string, unknown>;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface BankDepositRow {
  id: string;
  accountNumber: string;
  bankReferenceNumber: string | null;
  transactionDate: string;
  amount: string;
  typeCode: string;
  description: string | null;
  status: 'unmatched' | 'matched' | 'ignored';
}

export interface ImportBankStatementResult {
  importBatchId: string;
  imported: number;
  skipped: number;
  warnings: string[];
}

export interface AutoMatchResult {
  matched: number;
  ambiguous: number;
  remaining: number;
}

export interface PractitionerRow {
  id: string;
  workforceIdentityId: string;
  organizationId: string;
  displayName: string;
  npi: string | null;
  taxonomyCode: string | null;
  status: string;
  createdAt: string;
}

export interface PractitionerRoleRow {
  id: string;
  practitionerId: string;
  locationId: string;
  roleId: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  status: string;
}

export interface UserRow {
  id: string;
  email: string;
  status: string;
  mfaEnrolled: boolean;
  createdAt: string;
}

export interface RoleRow {
  id: string;
  key: string;
  displayName: string;
  isSystem: boolean;
  createdAt: string;
}

export interface UserRoleRow {
  id: string;
  userId: string;
  roleId: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface UserRoleGrant extends UserRoleRow {
  roleKey: string;
  roleDisplayName: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: unknown;
  instance?: string;
  request_id?: string;
}
