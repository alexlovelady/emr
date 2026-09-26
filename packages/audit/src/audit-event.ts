/** EHR_BUILD_SPEC.md §7.1 audit event envelope, exactly. */
export interface AuditEnvelope {
  tenantId: string;
  actor: { type: 'user' | 'system' | 'api_client' | 'patient'; id: string | null };
  action: string;
  resource: { type: string; id: string | null; patientId?: string | null };
  purpose?: string | null;
  requestId: string;
  ip?: string | null;
  userAgent?: string | null;
  outcome: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
}
