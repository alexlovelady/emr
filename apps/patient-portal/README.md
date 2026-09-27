# patient-portal

The patient-facing portal — the eCW/athenahealth parity roadmap's Phase F. The backend it calls
(`domains/portal`, `domains/consent`, `domains/messaging`'s portal routes) was fully built in the
original spec's Phase 8; this app is the first real UI for any of it.

Next.js 15 (App Router) + React 19 + TypeScript, shadcn/Radix UI primitives (hand-copied into
`components/ui`, same as clinician-web/admin-web) + Tailwind CSS.

## Architecture — a genuinely different auth model from clinician-web/admin-web

Same **BFF** shape (`middleware.ts`, `lib/api-proxy.ts`'s `callBackend()`, httpOnly cookies) but
pointed at a parallel, separate auth system — do not assume clinician-web's patterns transfer
directly:

- **Separate JWT audience and routes**: `POST /api/v1/portal/auth/{register,login,refresh,logout}`,
  a distinct token pair from staff's, so a browser can hold both a staff and a portal session without
  collision (this app uses `ehr_portal_access_token`/`ehr_portal_refresh_token` cookie names, not
  clinician-web's `ehr_access_token`/`ehr_refresh_token`).
- **No permission-key model** — there's no portal equivalent of `GET /auth/permissions` and no
  `PermissionsProvider`. Every route is either reachable by any authenticated portal account or it
  isn't; there is nothing to check client-side beyond "am I logged in."
- **404, not 403, means "no access"** — `ConsentService.assertAccess()` throws `NotFoundError` for
  every failure mode (wrong patient, no grant, expired/revoked grant) by design, so a portal account
  can never learn whether a patient id is real. `lib/api-proxy.ts`'s `callBackendOr()` treats a 404 as
  "render the empty state," not clinician-web's `callBackendOr()`'s 403-based version.
- **Registration is identity-proofing, not just account creation** — `POST /api/v1/portal/patients`
  (this app's own new endpoint, added this pass — see below) is how the app discovers which patient(s)
  an account may see; registering itself requires already knowing an existing patient's id *and* date
  of birth, verified server-side before a `'self'` proxy grant is auto-created.

## New backend endpoint added for this app

`GET /api/v1/portal/patients` (`domains/consent/src/proxy-grant/portal-my-patients.controller.ts`) —
none of the portal backend's routes are patient-id-agnostic, and the login/register response carries
no patientId, so there was no way for a frontend to discover which patient(s) an account could
access before this pass. Built on top of `ConsentService.listActiveByPortalAccount()`, which already
existed but had no HTTP route — the same "small, real, additive endpoint" pattern as every other
backend gap this build has closed (see clinician-web's `/auth/permissions` and admin-web's
role-assignment endpoints).

## Known trims

- **No self-scheduling** — `GET .../appointments` is read-only; there's no `POST` route for a patient
  to book their own appointment, so there's no "book" button here.
- **Records export is a JSON bundle, not C-CDA/PDF** — `POST .../export-requests` assembles
  demographics + active problems/allergies/medications + signed notes + released results as JSON,
  uploaded via the object-storage gateway. Real, complete, downloadable — just not the industry-
  standard C-CDA format a "Blue Button" style export would use.
- **Payment is a test-gateway demo** — `NoopPaymentGateway` always succeeds; the pay-balance form
  submits a hardcoded placeholder payment token, disclosed directly in the UI copy.
- **A proxy relationship (parent/guardian/caregiver) can only be created by staff** — there's no
  self-service "add a family member" flow; `POST /patients/:id/proxy-grants` requires
  `PROXY_GRANT_MANAGE`, a staff-only permission.
- **No mobile app** — responsive web only, per the original spec's MVP non-goals.
