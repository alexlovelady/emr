# portal

Phase 8 (EHR_BUILD_SPEC.md §17 / §26): the authenticated, transaction-scoped half of the patient
portal backend — session management, profile updates, read-only chart access, payments, and
records export. Every controller here is `@SkipAuthz()` (a `'patient'` actor can never pass
`@ehr/authz`'s staff-only `rolePermissionLayer`) and every service method calls
`@ehr/consent`'s `ConsentService.assertAccess()` before touching a patient's data.

Registration/login/refresh/logout deliberately do **NOT** live here — they run before any
request-scoped transaction exists (no tenant/actor is known yet), the same constraint that already
put staff auth in `apps/api/src/auth` instead of a `domains/*` package. See
`apps/api/src/portal-auth/portal-auth.service.ts`.

Reuses existing repositories/services wherever one already existed (`@ehr/scheduling`,
`@ehr/payments`'s `LedgerService`, `@ehr/documents`'s `DocumentService`); added a small number of
patient-scoped, status-filtered read methods to `@ehr/results`/`@ehr/clinical`/`@ehr/medication`
(`listReleasedByPatient`, `listSignedByPatient`, `listActiveByPatient`) rather than inventing a
parallel "patient visibility" flag, and a `PatientRepository.updateContactInfo`/
`PatientService.updateContactInfo` (contact fields only, applied directly — no separate
staff-review queue, a documented trim of spec's "with review rules" language).

Records export is synchronous (`export_requests`) — no async job queue exists yet (same reasoning
as Phase 4's FHIR bulk-export deferral) — and its download link is scoped to the requesting portal
account only, not every proxy with access to the patient.

"API/app authorization management" is scoped down to real session/device management
(`portal_refresh_tokens` list/revoke) — a full third-party OAuth-app consent flow is a separate,
larger feature the spec's own bullet doesn't detail further.
