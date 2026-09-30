# EHR Platform — Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 (Platform Foundation; Patient/Scheduling/Intake; Clinical Chart; Orders/Results + Interop; eRx; RCM; Query Platform; Patient Portal; AI Features; Pilot Readiness)

Cloud-native ambulatory EHR + practice-management + revenue-cycle platform. This repository
currently implements **Phases 1–10** of `EHR_BUILD_SPEC.md`'s build order (§26) — all ten. Phase 1: the
monorepo skeleton, tenant/workforce identity, the layered authorization model, audit +
transactional outbox, a first-party auth adapter, a thin documents flow, and the platform's
testing/CI/CD/observability scaffolding. Phase 2: the patient registry (with a per-organization
identifier table and a reversible duplicate-merge workflow — spec §5.3), insurance coverage
basics, appointment scheduling through check-in (spec §11.1), a generic task queue, lightweight
dynamic intake forms, and a read-only patient timeline shell. Phase 3: encounters (continuing the
golden path from CheckedIn through CodingReview), clinical notes with templates and a real
sign/amend lifecycle (spec §5.4), problems, allergies, vitals/observations, procedures, the
patient's medication list with reconciliation events (spec §5.5), and clinically-linked document
ingestion. Phase 4: orders and specimens, a lab adapter framework, the result inbox and
critical-result workflow (spec §5.6), HL7 v2 ORU^R01 ingestion, C-CDA-style external-candidate
reconciliation (spec §11.3), and a thin FHIR R4 + SMART-on-FHIR read facade with initial US Core
profiles — each interop area scoped to a real-but-minimal slice rather than a full standard
implementation (see "Phase 4 scope decisions" below). Phase 5: eRx integration — a swappable
`PrescribingGateway` vendor adapter (spec §14), new-Rx/refill/cancel workflows, pharmacy/medication
search and formulary lookups, and a real, permission-gated controlled-substance data model, with
EPCS itself (DEA-compliant identity-proofing/certified transmission) explicitly out of scope per
the spec's own prerequisite ("EPCS only after compliance/vendor prerequisites are satisfied") — see
"Phase 5 scope decisions" below. Phase 6: RCM — charge capture and a coding queue
(`domains/billing`), a versioned claim model with a real scrubber, submission, 277CA handling, and
denial/task workflow (`domains/claims`), and remittance posting, the patient ledger, and
eligibility checks (`domains/payments`), all against a swappable `ClearinghouseGateway` vendor
adapter (spec §13.1) — plus a new `apps/webhook-gateway` with real HMAC-signed webhook
verification for inbound 277CA/835 callbacks (spec §12's "signed webhooks"). No real X12 837/277/
835 transport is built (an explicit spec "buy" item) — see "Phase 6 scope decisions" below. Phase
7: query platform — a versioned cohort DSL and 7-step query compiler (spec §8.3) executing
directly against Postgres, a real Postgres full-text search index behind a swappable
`SearchIndexGateway` (standing in for Amazon OpenSearch), a governed, parameterized query catalog
for internal analysts (not raw SQL — spec's own "do not expose unrestricted SQL" rule), and CSV
cohort exports — with OpenSearch/ClickHouse deferred the same way ADR-0002 deferred Kafka (see
`docs/adr/0003-postgres-search-and-analytics-instead-of-opensearch-clickhouse.md` and "Phase 7
scope decisions" below). Phase 8: the patient portal backend — portal registration with real
patient-identity proofing (patientId + date of birth), a wholly separate portal JWT audience/token
pair, explicit effective-dated proxy-grant consent (`domains/consent`) rather than extending the
staff-only `PolicyEngine`, secure messaging (`domains/messaging`) with one staff controller and one
portal controller over the same tables, read-only portal chart access reusing the *existing*
release-status columns (no new "patient visibility" flag), a `PaymentGateway` vendor adapter
posting real `patient_payment` ledger entries, a synchronous JSON records-export, and portal
session management — see "Phase 8 scope decisions" below. Phase 9: AI features — a real internal
`AiGateway` (spec §15.1: prompt-template versioning, minimum-necessary context assembly, redaction,
a real per-tenant rate cap, model/version capture, the exact §15.4 provenance object) fronting all
8 spec §15.2 features (ambient note draft, encounter summary, chart Q&A grounded only in retrieved
chart evidence, patient-message drafting, coding suggestions, denial explanation summarization,
task summarization, NL-to-cohort-DSL) as real propose→human-review flows (`domains/ai`), backed by
a `NoopAiGateway` since no LLM vendor BAA exists (regulatory manual §16.1) — see "Phase 9 scope
decisions" below and `docs/adr/0004-deferred-ai-vendor.md`. Phase 10: pilot readiness — the buildable
half of it, at least: a golden-path end-to-end test suite covering real-but-previously-untested
safety behaviors (duplicate-patient merge/reverse-merge, signed-note immutability and amendment,
diagnostic-report amendment, the critical-result → Task wiring, and the AI-generation zero-context
guard), an actually-executed backup/restore drill (`docs/runbooks/backup-restore.md`), downtime and
support-operations runbooks, and an honest internal security self-assessment including a real
`pnpm audit` run — plus a master `docs/pilot-readiness-checklist.md` mirroring
`EHR_REGULATORY_MANUAL.md` §29's full pre-pilot gate, with every item either backed by real evidence
or explicitly named as a gap requiring a licensed pentest firm, healthcare counsel, clinicians, or a
real payer/vendor relationship this engineering-only build cannot produce or fake — see "Phase 10
scope decisions" below. No frontend was built as part of any numbered phase (`apps/patient-portal`
stays reserved) — see the `README.md` in each reserved-but-empty folder for where later work lands.
The first frontend, `apps/clinician-web`, was built after all 10 phases as post-spec work — see
"Repository layout" below.

Read `EHR_BUILD_SPEC.md` and `EHR_REGULATORY_MANUAL.md` first — this README assumes their
context. Four deliberate deviations from the spec's literal text are documented in
[`docs/adr/0001-railway-hosting.md`](docs/adr/0001-railway-hosting.md),
[`docs/adr/0002-deferred-event-bus-and-idp.md`](docs/adr/0002-deferred-event-bus-and-idp.md), and
[`docs/adr/0003-postgres-search-and-analytics-instead-of-opensearch-clickhouse.md`](docs/adr/0003-postgres-search-and-analytics-instead-of-opensearch-clickhouse.md):
Railway instead of AWS (no PHI exists yet, Phase 0 compliance work hasn't happened), a
first-party JWT auth adapter instead of Auth0/Okta, a Postgres-outbox instead of a managed
event bus, and Postgres full-text search plus a Postgres-executed cohort query compiler instead
of Amazon OpenSearch/ClickHouse — all swappable later behind the interfaces already in place.

## Prerequisites

- Node.js 24.x (see `.nvmrc`)
- pnpm 11.18.0 (`packageManager` field — Corepack will pick this up automatically)
- Docker (for local Postgres/Redis/MinIO via `docker-compose.yml`)

## Local development

```bash
pnpm install
docker compose up -d                        # Postgres, Valkey (Redis-compatible), MinIO
cp .env.example .env                        # adjust if needed; defaults match docker-compose.yml
pnpm --filter @ehr/db migrate:latest        # runs all migrations, creates the ehr_app role
pnpm --filter @ehr/db seed                  # two synthetic tenants — see below
pnpm dev                                    # turbo run dev --parallel: apps/api + apps/worker
```

`apps/api` listens on `http://localhost:3000` (`PORT` in `.env`), `apps/worker` exposes
`/healthz` on `http://localhost:3100` (`WORKER_PORT`).

### Seeded synthetic fixtures

`pnpm --filter @ehr/db seed` is idempotent and creates two tenants matching spec §18.2's own
naming (`tenant-a`, `tenant-b`), each with an admin user (`admin@tenant-a.test`) and a
lower-privileged staff user (`staff@tenant-a.test`), both using the password in
`DEV_PASSWORD` (`packages/db/src/seed-fixtures.ts`) — never use this seed against anything that
could contain real PHI.

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenantSlug":"tenant-a","email":"admin@tenant-a.test","password":"Dev-Passw0rd!"}'
```

## Everyday commands

Run from the repo root (Turborepo fans these out to every workspace package that defines the
script, skipping/caching what hasn't changed):

```bash
pnpm build              # tsc -p per package
pnpm lint               # eslint per package
pnpm lint:arch          # dependency-cruiser — structural rules (e.g. no raw pg/kysely outside packages/db)
pnpm typecheck
pnpm test                       # fast unit tests, no external services required
pnpm turbo run test:integration       # needs DATABASE_URL (docker compose Postgres)
pnpm turbo run test:tenant-isolation  # the Phase 1 exit gate (spec §18.2) — needs DATABASE_URL
```

`test`/`test:integration`/`test:tenant-isolation` are deliberately separate Turborepo tasks
(see `turbo.json`) rather than one big suite, so CI can gate on the tenant-isolation suite by
name.

## Repository layout

Follows spec §4 exactly. `apps/`, `packages/`, and `domains/` folders with no code yet each have
a `README.md` pointing at the build-order phase that needs them.

```
apps/           api (NestJS/Fastify), worker (outbox relay)
packages/       config, domain-common, db, outbox, audit, authz, auth-adapter,
                object-storage, observability, testing, api-contracts
domains/        tenant (organizations/locations), workforce (users/practitioners),
                documents (thin upload/download flow, now with clinical linkage), patient
                (registry/identifiers/coverage/merge/timeline), scheduling (appointments), tasks,
                intake (form templates/responses), clinical (encounters/notes/problems/allergies/
                observations/procedures), medication (list + reconciliation)
docs/           adr/, api/openapi.json, deploy/railway.md
infra/          terraform/, policies/, dashboards/ — all deferred, see their READMEs
```

`apps/clinician-web` is not part of the spec §4 build order above — it's the first frontend, built
after all 10 phases as the start of the post-spec "combine and improve on eClinicalWorks/
athenahealth" product direction. See [`apps/clinician-web/README.md`](apps/clinician-web/README.md)
and [`docs/adr/0006-clinician-web-bff-auth.md`](docs/adr/0006-clinician-web-bff-auth.md).
`apps/admin-web` and `apps/patient-portal` stay reserved — see their own READMEs.

## Architecture notes worth knowing before touching this code

- **Tenant isolation is structural, not conventional.** Every tenant-owned table has Postgres
  Row-Level Security keyed off a session variable (`packages/db`'s `withTenantContext`/
  `runWithRequestTransaction`), independent of whatever the application layer does. See
  `domains/*/test/tenant-isolation.spec.ts` for the tests that prove it.
- **Authorization is a fixed 8-layer pipeline** (`packages/authz`, spec §6.2) where only the
  role-permission layer can grant access — every other layer can only veto or abstain.
- **Audit and authorization run as global NestJS interceptors, not guards** — Guards execute
  before any interceptor gets to open the shared per-request database transaction
  (`apps/api/src/common/request-transaction.interceptor.ts`), so both had to become
  interceptors to share that transaction with the eventual domain write. Global interceptor
  *registration order* in `apps/api/src/app.module.ts` is load-bearing; see its comments.
- **MFA is real (TOTP, `otplib`), identity federation is still a structural stub.** Enrollment
  (`POST /api/v1/auth/mfa/enroll` + `mfa/confirm`) and login-time challenge (`POST
  /api/v1/auth/mfa/challenge`) are fully implemented in `packages/auth-adapter` — a login for an
  enrolled user returns `{mfaRequired: true, mfaPendingToken}` instead of real tokens; the pending
  token is a short-lived (300s), separately-audienced (`ehr-mfa-pending`) signed JWT proving the
  caller already presented the correct password for that specific user, closing the arbitrary-user
  TOTP-brute-force hole a raw client-supplied `userId` at the challenge step would have opened.
  `clinician-web`/`admin-web` both have a two-step login UI and a Settings → Security page (QR
  enrollment via the `qrcode` package). SSO/SAML/OIDC federation is still not implemented — do not
  point this at real workforce credentials or real patient data — see ADR-0002 and
  `EHR_REGULATORY_MANUAL.md` §29's pre-pilot gate.
- **Patient identity never uses an external identifier as the primary key** (spec §5.3) — `patients.id`
  is the only stable key; MRNs and other external identifiers live in `patient_identifiers`,
  scoped to the issuing organization. Duplicate detection (`GET /api/v1/patients/duplicates`) is
  deterministic scoring only and never merges anything automatically — `POST
  /api/v1/patients/{id}/merge` is an explicit human action, and it's reversible via `POST
  /api/v1/patients/merges/{mergeId}/reverse` (`domains/patient`).
- **The appointment status column is an explicit state machine**
  (`domains/scheduling/src/appointment/appointment.service.ts`), not a free-text field — the
  states before an Encounter exists were Scheduled/Confirmed/CheckedIn/Cancelled/NoShow in Phase 2,
  with a `Waitlisted` state added in the eCW/athena parity roadmap's Phase I (reachable from
  Scheduled/Cancelled, promotable back to Scheduled — `promote()` re-runs the same conflict check
  before allowing it). Phase 3's `domains/clinical/src/encounter/encounter.service.ts`
  continues the same golden path (spec §11.1): an Encounter can only be created from a
  `checked_in` appointment, and its own state machine runs Roomed → InProgress → Documentation →
  Signed → CodingReview — the RCM states after that (ClaimReady, Submitted, ...) are Phase 6.
- **Double-booking is blocked by default, with an explicit `override: true` escape hatch** (Phase
  I) — `AppointmentService.create()` checks for overlapping appointments against the same
  practitioner AND against any requested `resourceIds` (rooms/equipment, a new `resources` +
  `appointment_resources` join table) before booking, throwing `ConflictError` unless the caller
  passes `override: true`. Recurring series (`POST /appointments/series`, a simple
  `{frequency, count, until}` shape denormalized onto every appointment row via `recurrence_rule`,
  correlated by a shared `series_id` — not full iCal RRULE) run every occurrence through the exact
  same conflict check, so a series booking fails atomically if any occurrence collides.
- **A signed clinical note is never mutated, ever** (spec §5.4) —
  `domains/clinical/src/note/note.service.ts`'s lifecycle is DRAFT → READY_FOR_REVIEW → SIGNED,
  with VOIDED/ENTERED_IN_ERROR reachable only pre-sign. Correcting a signed note (`amend()`)
  inserts a brand-new note row with `amendsNoteId` pointing at the original; the original's
  content and status are never written to again. `GET /api/v1/notes/{id}` returns the note plus
  its full forward amendment chain.
- **Problem/Allergy/Medication hang off Patient; Observation/Procedure hang off Encounter** —
  a direct, deliberate reflection of spec §5.2's aggregate diagram, encoded structurally (which FK
  is nullable vs. required) rather than left as an application-layer convention.

### Phase 4 scope decisions

- **Orders are encounter-scoped, not patient-scoped** (`domains/orders`, `orders.encounter_id`
  is `NOT NULL`) — a refinement made mid-build so an inbound HL7 result can always correlate back
  to a concrete encounter. Individual lab result values reuse Phase 3's `observations` table
  (`category: 'laboratory'`, with new nullable `order_id`/`specimen_id` FKs) rather than a
  parallel table — paying off that table's original generic design.
- **Critical results are durable workflow tasks, not UI toasts** (spec §5.6) — creating a
  `diagnostic_reports` row with `criticalFlag: true` automatically creates a `Task` via the
  existing `@ehr/tasks` package (`domains/results/src/diagnostic-report/diagnostic-report.service.ts`).
- **HL7 v2 support covers ORU/ADT/SIU/ORM** (the eCW/athena parity roadmap's Phase J added
  ADT/SIU/ORM on top of Phase 4's original ORU^R01-only support; MDM remains deferred per the
  spec's own "as needed" license). `apps/interop-hl7` exposes an authenticated HTTP endpoint (not a
  real MLLP listener — documented simplification) that always stores the raw message first, is
  idempotent on `(tenant_id, message_control_id)` redelivery, and NACKs without crashing when a
  message can't be correlated to an order/patient/appointment/encounter. Every parser in
  `packages/hl7` is real-but-minimal, not full HL7 v2.5.1 conformance — see its own doc comments
  (`adt.ts`, `siu.ts`, `orm.ts`) for exactly which segments/fields are read and which real-world
  complexity (inpatient/bed management, TQ1 timing quantities, MRN crosswalks) is deliberately not
  modeled. All ADT/SIU/ORM correlation fields (patient/practitioner/location/appointment/encounter
  identifiers) carry this system's own UUIDs by convention — the same posture ORU's placer-order-
  number correlation already used, since no real external interface partner exists to test a
  genuine external-identifier crosswalk against.
- **C-CDA reconciliation accepts pre-structured JSON**, not real C-CDA XML — the actual product
  requirement (spec §11.3's accept/reject/mark-duplicate/replace workflow) is fully real in
  `domains/clinical`'s `external-candidate` sub-module; only the XML-parsing front door is deferred.
- **FHIR R4 is a thin read-only Lane A facade** (`apps/interop-fhir`): `/fhir/r4/metadata`,
  `Patient/{id}`, `Observation?patient=&category=`, `Encounter?patient=`, plus (Phase J)
  `Condition`, `AllergyIntolerance`, `MedicationRequest`, and `DocumentReference` (each a
  `GET .../{id}` + a `patient`-scoped search) — `$everything`/bulk `$export` need a job queue this
  repo doesn't have yet and are a documented gap, not a silent one. `AllergyIntolerance.code` is
  `{text: ...}` only, no `coding[]` — `domains/clinical`'s Allergy is genuinely pure free text
  today, so a fabricated coding system would be dishonest. `DocumentReference.content[].attachment.url`
  points at this app's own download route rather than a real presigned object-storage URL, keeping
  every `toFhir*` mapping function in `packages/fhir-mapping` a pure synchronous function (the only
  alternative would need the async, gateway-backed `DocumentService.getDownloadUrl()`, which this
  read-only app doesn't wire up).
- **SMART auth is client-credentials only** — a seeded `smart_clients` row, no interactive
  authorization-code/launch/patient-picker flow (needs a consent UI this API-only build doesn't
  have). Scope enforcement (`SmartScopeGuard` + `@RequireScope`) is a separate mechanism from
  `@ehr/authz`'s 8-layer `PolicyEngine` — SMART apps aren't staff users with `user_roles`.
- **Two new deployable apps** (`apps/interop-fhir`, `apps/interop-hl7`) mirror `apps/api`'s
  bootstrap shape but are trimmed to their own concerns — `interop-fhir` uses FHIR
  `OperationOutcome` errors and SMART scopes instead of RFC 7807 and the staff permission catalog;
  `interop-hl7` reuses the same staff/system JWT auth and the full authz/audit interceptor chain
  as `apps/api`.
- **JWT signing key material must be an absolute path once more than one app reads it** — see the
  comment in `.env.example`. `pnpm --filter X exec tsx src/main.ts` runs with CWD set to package
  `X`'s own directory, so a relative key path silently generates a different keypair per app,
  breaking cross-app token verification. All local dev commands in this README export `.env` into
  the shell first for exactly this reason.

### Phase 5 scope decisions

- **eRx lives inside `domains/medication`, not a new `domains/erx`** — the spec's own repo
  structure (§4) doesn't reserve a separate eRx domain, and `domains/medication`'s original
  migration doc-comment already earmarked this exact extension. A new `prescriptions` table layers
  on top of Phase 3's `medications` table the same way Phase 4's `diagnostic_reports` layered on
  top of `observations`: creating a prescription creates the underlying medication-list entry too.
- **`packages/erx-adapter`** mirrors `packages/lab-adapter`'s shape exactly: a `PrescribingGateway`
  interface (the 6 methods spec §14 names) + a `NoopPrescribingGateway` stub backed by a small
  embedded synthetic medication/pharmacy dataset — "do not build pharmacy-network connectivity
  from scratch for v1," same adapter-interface-now pattern as ADR-0002 and the Phase 4 lab adapter.
- **Clinical-safety interaction checking is real plumbing, honestly stubbed** (the eCW/athena
  parity roadmap's Phase K) — `packages/interaction-adapter` mirrors every other vendor-boundary
  adapter here (`LabOrderGateway`, `PrescribingGateway`, ...): an `InteractionCheckGateway`
  interface + `NoopInteractionCheckGateway`, the only implementation, which always returns no
  findings because no licensed drug-interaction/drug-allergy database (First Databank, Medi-Span,
  ...) is connected in this environment and none can be without a real commercial license.
  `PrescriptionService.create()` really calls it — gathering the patient's active-medication
  RxNorm codes plus the new one, and active-allergy codes (allergies gained optional, nullable
  `codeSystem`/`code` columns for this — still pure free text otherwise) — and returns the findings
  alongside the created prescription (`{prescription, interactionFindings}`, not bolted onto
  `PrescriptionRow` itself, since nothing is persisted). `apps/clinician-web`'s prescribe dialog
  shows a persistent, unconditional notice ("not available — no drug-database vendor connected")
  precisely so an empty findings list reads as "no check happened," never as "checked, and it's
  clear" — removing or softening that notice without first replacing the Noop gateway would turn
  honest plumbing into a fake safety feature.
- **Controlled substances are gated by route, not by an in-service second permission check** —
  `POST /patients/{id}/prescriptions` requires `medication.prescribe` and rejects a
  controlled-substance payload; `POST /patients/{id}/prescriptions/controlled` requires the
  elevated `controlled_substance.prescribe` and rejects a non-controlled payload. A repo-wide
  search turned up no precedent anywhere for a second, in-service `PolicyEngine.authorize()` call
  — every route in every domain uses exactly one `@RequirePermission` decorator — so this two-route
  split was chosen to fit the existing architecture rather than invent a new authorization pattern
  for one phase.
- **A real DEA rule is enforced for free**: the `CreatePrescriptionSchema` Zod refine rejects a
  Schedule II prescription with any refills authorized (Schedule II drugs cannot be refilled —
  each fill needs a new prescription) — cheap, genuine domain accuracy at the DTO layer.
- **EPCS itself is not built.** `isControlledSubstance`/`deaSchedule` and the elevated permission
  make the *data model and authorization gate* real, but actual DEA-compliant identity-proofing,
  2FA, and certified transmission are out of scope — the spec's own Phase 5 bullet list says "EPCS
  only after compliance/vendor prerequisites are satisfied," and `EHR_REGULATORY_MANUAL.md` §12.2
  is explicit that EPCS needs "an experienced EPCS vendor and healthcare counsel," not an
  improvised flow.
- **The refill workflow has no inbound listener app** — `POST /prescriptions/{id}/refill-requests`
  logs a request that stands in for a real inbound NCPDP SCRIPT message, the same class of
  simplification as Phase 4 using an authenticated HTTP endpoint instead of a real MLLP listener
  for HL7. Refill approval is always gated by the plain `medication.prescribe` permission, even for
  a controlled-substance prescription's refill — a documented scope trim, not a silent gap.
- **No new deployable app.** Unlike Phase 4's HL7/FHIR (external wire protocols needing dedicated
  listeners), eRx here is an outbound gateway call plus ordinary internal CRUD/state-machine
  routes, so everything lives in `apps/api`.

### Phase 6 scope decisions

- **Three new domains matching the spec's own reserved folders**, not one combined package —
  `domains/billing` (charge capture + coding queue), `domains/claims` (the versioned claim model,
  scrubbing, submission, 277CA, denials), `domains/payments` (remittance posting, the patient
  ledger, eligibility). `domains/payments` depends on `domains/claims` (to update claim status),
  never the reverse — the claim timeline endpoint therefore lives in `domains/payments`, composing
  `@ehr/claims`' own claim+versions+denials with this package's Remittances, the same
  "the timeline lives in the downstream-consuming domain" pattern Phase 2's `PatientTimelineService`
  already established (it pulls from `@ehr/scheduling`/`@ehr/tasks` rather than either of those
  owning a patient-timeline endpoint).
- **No real X12 837/277/835 transport** — spec §13.1 explicitly marks payer/clearinghouse
  connectivity, eligibility routing, and X12 transport as **buy**, not **build**, items. A new
  `packages/clearinghouse-adapter` (`ClearinghouseGateway` + `NoopClearinghouseGateway`, mirroring
  the lab/eRx adapters exactly) stands in for a vendor like Stedi; inbound 277CA/835 arrive as
  pre-structured JSON, the same simplification already used for Phase 4's C-CDA reconciliation.
- **The claim scrubber is real, not stubbed** — spec §13.1 explicitly lists it as a **build** item.
  `domains/claims/src/claim/scrub-claim.ts` checks CPT/HCPCS code format, that diagnosis codes are
  present, that at least one charge exists, and that the total is positive; `submit()` throws a 422
  with the issue list rather than mutating anything when the scrubber finds a problem — confirmed
  live, not just documented.
- **Claim versioning matches spec §13.2's literal example** — "Never mutate a submitted claim in
  place": ClaimVersion 1 is `draft` at creation, `submit()` creates the next version `submitted`
  (a rejected claim can be corrected and resubmitted through the same endpoint for ClaimVersion 3+).
  `claims.status` is a separate state machine continuing where the Encounter's own state machine
  stops (`coding_review`, spec §11.1): `draft -> submitted -> accepted/rejected -> adjudicated ->
  paid/denied`.
- **A charge ledger entry posts on claim *acceptance*, not claim *submission*** — a refinement made
  mid-build, more financially accurate than the original plan (a submitted claim isn't yet a real
  receivable; an accepted one is). This orchestration — calling both `@ehr/claims` and
  `@ehr/payments` — lives in `apps/webhook-gateway`'s 277CA handler, since the two domains can't
  depend on each other for it. Idempotency is enforced by checking whether the claim had already
  reached that status before the acknowledgement was recorded, so a redelivered 277CA never
  double-posts the charge.
- **`apps/webhook-gateway` uses real HMAC-SHA256 signature verification**
  (`crypto.createHmac`/`crypto.timingSafeEqual`, `X-Webhook-Signature: sha256=...`), not staff JWT
  — spec §12 explicitly calls for "signed webhooks," and the caller here is a genuine external
  clearinghouse with no staff actor to authenticate as. A repo-wide search turned up no prior HMAC
  verification code anywhere, so this is new, security-sensitive code, unit-tested in isolation
  (valid/tampered/wrong-secret/missing-header/malformed-hex cases) and confirmed live: an unsigned
  or badly-signed webhook is rejected with a real 401.
- **The webhook handler resolves its tenant via the owner-role DB connection** — a clearinghouse
  callback carries only the clearinghouse's own transaction id, not a tenant-scoped JWT, so
  `apps/webhook-gateway` looks up the owning `claims` row via `OWNER_DB_CONNECTION` (bypasses RLS
  on purpose) before switching into a normal tenant-scoped transaction for every subsequent domain
  write — the identical bootstrapping exception `apps/interop-fhir`'s `TokenService` already uses
  for its cross-tenant `smart_clients` lookup.
- **No dedicated raw-webhook-store table**, unlike HL7's `hl7_messages` — idempotency is checked
  against existing domain state instead (a 277CA no-ops if the claim's status already matches; an
  835 no-ops on a matching `remittance_advice_number`). HL7 needed raw-message preservation as its
  own stated requirement; X12 acks here have no equivalent — a documented trim, not scope creep.
- **No `audit_events` rows for webhook-driven writes** — there's no human/staff actor to attribute
  the action to (`apps/webhook-gateway` runs neither `AuthzInterceptor` nor `AuditInterceptor`, the
  same reasoning `apps/interop-fhir` already established for its own non-staff callers).
  `outbox_events` remain the complete, durable record of what happened — confirmed live: every
  webhook-driven write lands there even though none lands in `audit_events`.
- **Diagnosis codes are a denormalized `text[]` column on `charges`**, not a dedicated `Diagnosis`
  aggregate — Phase 3 never built one and Phase 6's bullet list doesn't call for retrofitting it.
- **`coverages.payerName` stays free text** (confirmed: no payer master table exists anywhere in
  this repo) — `claims.coverage_id` is a nullable FK to it, matching the existing shape exactly
  rather than introducing new normalization this phase doesn't need.

### Phase 7 scope decisions

- **OpenSearch and ClickHouse are both deferred**, ADR-0002-style — see
  `docs/adr/0003-postgres-search-and-analytics-instead-of-opensearch-clickhouse.md`. Postgres
  full-text search (`tsvector`/GIN) and the cohort compiler running directly against the primary
  database are real, working substitutes, not stubs — the same posture ADR-0002 used for the
  outbox standing in for Kafka.
- **The cohort DSL implements spec §8.3's JSON shape literally**, supporting exactly what its own
  worked example shows: one `field` (`age`), three `concept`s (`condition`/`allergy`/`medication`,
  prefix-matched), and the two named `measure`s (`latest_hba1c` — LOINC `4548-4` — and
  `days_since_completed_encounter`) — confirmed live: the spec's own example (age 45-75, active
  E11 diagnosis, HbA1c > 9, days since last encounter > 180) compiles and returns exactly the
  matching patient.
- **The query compiler's cost estimate is real** — `EXPLAIN (FORMAT JSON)` against the actual
  compiled query, not a fabricated number. Confirmed live: the estimate and the true result count
  can legitimately differ (Postgres's planner estimate vs. actual rows), which is genuine planner
  behavior, not a bug.
- **Cohort executions return a bounded patient-id list** (capped at 5,000), never full
  demographics — matching population-query minimum-necessary principles. A separate, audited
  export step (`POST /cohort-executions/{id}/export`) is the deliberate path to get more.
- **"Governed SQL for internal analysts" is a fixed, parameterized catalog**, not a SQL parser or
  executor — spec §8.3 itself opens with "Do not expose unrestricted SQL to normal customers." Three
  governed queries are registered (patient count by active problem, encounters by month, claims
  status breakdown); each has its own Zod param schema and runs pre-written, tenant-scoped SQL —
  callers never supply table/column names or raw SQL.
- **Only three resource types are wired into search** (Patient, Document, Claim) of the seven spec
  §9 lists, triggered by an explicit `POST /search/reindex` admin action rather than live on-write
  indexing hooks — a documented gap the existing outbox events could feed a future indexer-worker
  without changing `SearchIndexGateway`'s interface.
- **Authorization filters inside the search query, not after retrieval** (spec §9's explicit
  rule) — every indexed document carries `sensitivityTags`/`allowedContextTags` and the SQL
  `WHERE` clause checks array containment directly. Confirmed live and in the automated suite:
  nothing currently *produces* a non-empty `sensitivityTags` value (no resource type in this repo
  has a "restricted" classification yet) — the column and the filter are real, the classification
  rule that would populate it isn't, an honest gap rather than a silently-skipped one.
- **`ObjectStorageGateway` gained a real `putObject()` method** (a genuine server-side write, every
  other method on that interface only issues a pre-signed URL for a client) — needed because
  cohort CSV exports are server-generated with no client upload step to presign against.
- **NL-to-DSL's actual LLM step is not built** — spec §8.4 is explicit that "NL query is only a
  front end to the cohort DSL," and the AI gateway (approved-model list, redaction, provenance)
  that step needs is Phase 9's own deliverable, not this phase's. The DSL/validator/executor it
  would sit in front of is fully real today.
- **No visual cohort builder** — no frontend has been built in any phase so far (every
  `apps/*-web` folder remains reserved-but-empty); this phase stays consistent with that
  established, backend-only boundary.

### Phase 8 scope decisions

- **`PolicyEngine` structurally cannot grant a patient/proxy actor access** —
  `packages/authz/src/layers/role-permission.layer.ts`'s `rolePermissionLayer` unconditionally
  returns `DENY` for any actor whose `type !== 'user'`, no matter what the (still-stubbed)
  `consentProxyLayer` would say. Rather than extending the staff-only 8-layer engine, portal
  routes use `@SkipAuthz()` plus an explicit `ConsentService.assertAccess()` call — the same
  structural reason Phase 4 gave `apps/interop-fhir` its own `SmartScopeGuard` instead of teaching
  `PolicyEngine` about SMART clients.
- **Portal routes live inside `apps/api`**, not a new app/process — unlike interop-fhir/
  interop-hl7/webhook-gateway (genuinely external callers with real deployment-boundary reasons),
  the portal is our own product's other user type reading/writing the same tables. A second,
  parallel Fastify `onRequest` hook (`attachPortalContext`) tries a portal-audience token whenever
  `attachEhrContext` didn't already set an actor from a staff token — the two hooks trying the same
  bearer token against two different audiences is what makes a staff token structurally unable to
  authenticate a portal route and vice versa (confirmed live, see below).
- **Portal registration/login/refresh/logout live in `apps/api/src/portal-auth`**, not
  `domains/portal`, for the exact reason staff auth already lives in `apps/api/src/auth` instead of
  a domain package: these routes run before any request-scoped transaction exists, so they can't
  use `getCurrentTransaction()` and must hold the raw pool connection directly.
- **`RequestContext.actor.type` gained `'patient'`** (confirmed non-breaking via a repo-wide grep —
  no exhaustive switch on this field existed anywhere). `@ehr/audit`'s `AuditEnvelope.actor.type`
  needed the same widening so portal actions are genuinely audited, not silently rejected by a
  stale union type.
- **Proxy/consent is a real, effective-dated, scoped grant model** (`domains/consent`,
  `patient_proxy_grants`) — `ConsentService.assertAccess()` throws 404 (not 403) whenever no
  active, in-window grant exists, so a portal caller can never distinguish "no such patient" from
  "not your patient," the same tenant-isolation philosophy applied to proxy access. Self-access is
  just another grant (`relationship_type: 'self'`, auto-created at registration) — no special-casing
  anywhere in the authorization code. The `scope` column is real but not yet enforced
  per-category — any active grant currently grants full access. **Minor/state-law consent
  transition rules are explicitly NOT implemented** — spec's own words: "not a simple `parent=true`
  flag" — the same treatment Phase 5 gave EPCS.
- **Results/notes portal visibility reuses existing release-status columns**
  (`diagnostic_reports.review_status in ('reviewed','acknowledged')`, `notes.status = 'signed'`)
  rather than inventing a parallel "patient visibility" flag — confirmed live: a `pending` result
  and a `draft` note are both correctly excluded from what a portal caller can see.
- **Secure messaging is one resource, two controllers** (`domains/messaging`) — a staff-authored
  message notifies every portal account with an active proxy grant for the patient via the new
  `NotificationGateway` adapter; **a portal-authored message does not notify staff** in this pass —
  no assigned-practitioner/staff-inbox model exists yet to resolve a real delivery target, a
  documented gap rather than a fake mechanism.
- **A successful portal payment posts a real `patient_payment` ledger entry** via the existing
  `LedgerService.postEntry()` — a value the check constraint already allowed (migration `0025`) but
  nothing had exercised until now — through a new swappable `PaymentGateway` adapter (spec §13.1's
  "buy" item, finally exercised by a real caller).
- **Records export is synchronous, not a job queue** (`export_requests`) — same reasoning as Phase
  4's FHIR bulk-export deferral — and its download link is scoped to the requesting portal account
  only, not every proxy with access to the patient, since an export bundle is a standing PHI
  artifact in object storage.
- **"API/app authorization management" is scoped to real session/device management**
  (`portal_refresh_tokens` list/revoke) — a full third-party OAuth-app consent flow is a separate,
  larger feature the spec's own bullet doesn't detail further.
- **Profile updates apply directly**, contact fields only (never name/DOB), through
  `PatientRepository.updateContactInfo` — no separate staff-review queue, a documented trim of
  spec's "with review rules" language.
- **A real DI bug surfaced and was fixed during manual verification**: `apps/api`'s dev-mode
  esbuild transform (via `tsx watch`) did not reliably emit constructor parameter-type metadata for
  a brand-new controller with a single, purely type-inferred constructor parameter
  (`PortalAuthController`) — every prior `apps/api`-local controller happened to always mix in at
  least one explicit `@Inject(TOKEN)` parameter, so this path had never been exercised. Fixed by
  adding an explicit `@Inject(PortalAuthService)` token, the same defensive pattern
  `AuthController` already used for its own non-class token dependency; domain-package controllers
  (real `tsc` output, not `tsx`/esbuild) were unaffected.

### Phase 9 scope decisions

- **No LLM vendor BAA exists in this environment** (`EHR_REGULATORY_MANUAL.md` §16.1) — the same
  category of prerequisite ADR-0002 already named for an external identity provider. A real
  `AiGateway` interface (`packages/ai-adapter`) is built covering every §15.1 responsibility as a
  genuine, checkable contract, backed by exactly one implementation, `NoopAiGateway` — a
  deterministic stub with no network call. `isApprovedForPhi()` returns `false` unconditionally, a
  real statement rather than a placeholder — see `docs/adr/0004-deferred-ai-vendor.md`.
- **One shared `ai_generations` table and `AiGenerationService` back all 8 features**
  (`domains/ai`), adapted directly from Phase 4's `ExternalCandidateService`
  (`pending → accepted / accepted_with_edits / rejected`, the same double-resolution
  `ConflictError` guard, one outbox event per transition). What differs per feature is only the
  context each one assembles — eight thin controllers front the one shared core, the same
  "one service behind several thin front doors" shape Phase 8 used for messaging.
- **Every proposal requires at least one grounding context reference, or it is rejected** — spec
  §15.3's "no unsourced clinical facts" enforced structurally, not just by policy or prompt
  wording. Confirmed live: chart Q&A against a patient with no active problems/allergies/
  medications/signed notes/results, and a task summary with no open tasks, both correctly return a
  real 422 rather than a hallucinated answer.
- **Accepting a generation never mutates another domain's data, for 7 of the 8 features** — the
  most literal reading of §15.3's "never auto-applying" / "silent chart mutation": a human takes
  the accepted (possibly edited) output and uses the existing, already-audited domain-write
  endpoint themselves (`domains/ai` never calls `NoteService.create()`, `ChargeService.create()`,
  `MessageThreadService.reply()`, etc.). Confirmed live: accepting an ambient note draft and a
  coding suggestion created zero new `Note`/`Charge` rows. **NL-to-cohort-DSL is the one deliberate
  exception** — "accept" and "execute" are the same action per spec §8.4's own flow, and executing
  an already-permission-gated, already-capped, read-only population query is categorically
  different from mutating clinical/financial state.
- **NL-to-cohort-DSL reuses `@ehr/query`'s existing, unmodified `CohortDslSchema` validator and
  `CohortService.execute()` compiler** (Phase 7) rather than building a second one — this *is*
  spec §8.4's "deterministic validator." `domains/ai` never touches SQL and the (Noop) LLM never
  receives a database handle, satisfying §8.4's "never receives a raw database credential"
  structurally, not just by convention.
- **Rate limiting is real** (an in-memory per-tenant daily cap in `NoopAiGateway`, throwing a real
  `RateLimitExceededError` past the cap) since it needs no vendor relationship to build — but it is
  in-memory/single-process only, not persisted, a documented limitation to revisit before any
  multi-instance deployment.
- **Evaluation telemetry and hallucination-rate metrics are not implemented** — an explicit gap,
  the same treatment ADR-0002 gave MFA. `EHR_REGULATORY_MANUAL.md` §16.2 requires an evaluation
  dataset and a hallucination/unsupported-fact metric per feature; the `ai_generations` table is
  real substrate a future evaluation pipeline could query (every generation and every
  accept/reject/edit decision is durably recorded), but no eval harness exists yet.
- **All 8 features are staff-only** (permission-gated, `actor.type === 'user'`) — spec's own
  phrasing ("ambient scribe," "coding suggestions," "denial summaries") and the Phase 9 build-order
  bullet list are clinician/coder/biller tools. "Patient-message drafting" means staff drafting a
  reply to a portal message, not a patient-facing generative feature.

### Phase 10 scope decisions

- **Only the buildable half of Phase 10 was built, on purpose.** `EHR_BUILD_SPEC.md` §26's Phase 10
  bullet list mixes real engineering work (E2E tests, a restore drill, runbooks, a security
  self-review) with things that require a licensed pentest firm, clinicians, healthcare counsel, and
  real payer/vendor relationships — an independent penetration test, a clinical hazard-register
  sign-off, a launch-state legal review, and payer/vendor enrollments cannot be performed or
  meaningfully approximated by an engineering pass, and claiming otherwise would be a real
  misrepresentation, not a thin-but-honest stub like the vendor adapters in earlier phases. The user
  confirmed this split explicitly before any of this phase's work started.
- **The golden-path E2E suite targets genuinely untested-but-real safety behavior, not everything.**
  Of `EHR_REGULATORY_MANUAL.md` §24's 17 clinical hazards, only 3 had any test coverage before this
  phase (all inside one HL7 integration test), several have a real application-level control that
  had simply never been exercised end to end (patient merge/reverse-merge, note/diagnostic-report
  amendment immutability, the AI generation zero-context guard), and several have **no control
  implemented at all** (medication/allergy interaction checking, dose/unit validation, unit
  conversion, stale copied-forward note tracking). Building those missing controls would be new
  clinical-safety *features*, not "pilot readiness" testing of what already exists — the checklist
  and self-assessment name them as real gaps instead of inventing shallow versions to claim coverage.
- **The E2E suite follows the existing integration-test convention exactly** — direct, in-process
  service calls against a shared Kysely handle (`apps/api/src/e2e/golden-path.integration.test.ts`,
  picked up automatically by the pre-existing `vitest.integration.config.ts` glob, no new Turbo task
  needed) — rather than introducing `@nestjs/testing`/`supertest` HTTP-level scaffolding that no
  other integration test in the repo uses (`supertest` has been an installed-but-unused `apps/api`
  devDependency since Phase 1). See `docs/adr/0005-golden-path-testing-and-backup-restore-approach.md`.
- **The backup/restore drill was actually run, not just written down** — `EHR_REGULATORY_MANUAL.md`
  §25's own words: "a green backup dashboard is not evidence that restoration works." A canary patient
  row was inserted, the embedded-Postgres data directory was stopped and physically copied, and a
  second, independent Postgres instance was started against that copy on a different port to verify
  the canary row and full table counts were genuinely present — see `docs/runbooks/backup-restore.md`'s
  "Last tested" section for the real, logged result (2026-09-26).
- **The drill uses a physical (data-directory copy) backup, not `pg_dump`/`pg_restore`** — the
  `embedded-postgres` distribution used for Docker-free local dev bundles `postgres`/`pg_ctl`/`initdb`
  but not the logical-dump tools a standard Postgres install would have. Production (Railway-hosted
  Postgres, ADR-0001) would use its own snapshot/PITR mechanism instead — this drill validates the
  underlying property ("a backup restores with the data intact"), not the exact production mechanism.
- **The security self-assessment includes a real, current `pnpm audit` run** (32 findings: 2
  critical, 16 high, 13 moderate, 1 low as of 2026-09-26), triaged by actual production-reachability
  rather than raw severity — e.g. confirming via a repo-wide grep that `kysely`'s two SQL-injection
  advisories (`sql.lit()`, `JSONPathBuilder`) reference APIs never actually called anywhere in this
  codebase, so the finding is a real, worth-fixing dependency-currency item but not an active
  exploit path today. This is explicitly documented as an internal engineering self-assessment, not
  a substitute for `EHR_REGULATORY_MANUAL.md` §29's "independent penetration test" requirement.
- **The master checklist (`docs/pilot-readiness-checklist.md`) mirrors §29's exact structure and
  item text**, with every single box individually marked — `[x]` only where real evidence exists
  (pointing at a specific test file, this session's commits, or a runbook), `[ ]` with a one-line
  note on exactly what's missing and who owns closing it. Nothing is checked off without something
  real behind it, and nothing is silently dropped from the manual's own list.

### eCW/athena parity roadmap — Phase L scope decisions

- **`kysely` upgraded `^0.27.4` → `^0.28.17`** (all 31 workspace packages that depend on it) —
  fixes two real, high-severity SQL-injection advisories (JSON-path traversal in
  `JSONPathBuilder.key()`/`.at()`, insufficient backslash escaping in `sql.lit()`), confirmed
  non-reachable in this codebase's actual query usage today but core to the data layer. A clean
  upgrade — no code changes needed, full repo-wide lint/typecheck/build/test suite green
  unchanged.
- **NestJS `^10.4.15` → `^12.1.0` and `fastify` `4.28.1` → `^5.12.5`, across every workspace
  package that touches either** (not just the 4 apps that boot a server — every `domains/*` and
  several `packages/*` also declare these as dependencies, since their controllers/interceptors
  reference `FastifyRequest`/`Reflector`/etc. directly). Fastify's own security patches were never
  backported to the 4.x line — every CVE fix (Content-Type header validation bypass, the
  `@fastify/middie` middleware-bypass family, request spoofing, schema-coercion bypass) only
  exists on 5.x, which in turn requires NestJS 11+ (`@nestjs/platform-fastify` only supports
  Fastify 5 from that point on) — landed on 12.1.0 since 11.x itself had several of its own
  still-open security advisories that only 12.x closes. **Two real breaking changes found and
  fixed**: (1) `packages/api-contracts`'s `declare module 'fastify' { interface FastifyRequest {
  ehrContext... } }` ambient augmentation stopped merging once `apps/api` resolved a *different*
  `FastifyRequest` type identity than the augmentation's own `fastify` import — every package with
  its own separately-versioned `fastify` devDependency needed bumping in lockstep, not just the
  4 apps that boot a server. (2) Several `domains/*` packages (found via actually failing at
  runtime, not typecheck) still declared `@nestjs/common`/`@nestjs/core` `^10.4.15` as their own
  dependency; a mixed-version NestJS DI graph silently broke constructor-parameter-type injection
  for undecorated dependencies (`AuthzInterceptor`'s `Reflector` parameter resolved to a *different
  class reference* than the one `apps/api`'s container recognized, throwing `Nest can't resolve
  dependencies` only at boot, never at compile time) — every package declaring `@nestjs/common`/
  `@nestjs/core` needed the same version, not just the packages that literally call
  `NestFactory.create()`. Verified via the full repo-wide static-check + test suite (both green)
  **and** live smoke tests against all 4 running apps post-upgrade (health checks, an authenticated
  CRUD round trip through the full guard/interceptor chain, RFC 7807 error formatting, JSON body
  parsing, and `interop-hl7`'s custom `text/plain` HL7 body parsing) — the DI regression above only
  ever showed up at runtime, so static checks alone would have missed it.
- **`@opentelemetry/*` bumped to current majors** (`api` 1.9.0→1.9.1, `auto-instrumentations-node`
  0.53→0.80, `exporter-{trace,metrics}-otlp-http` 0.57→0.222, `resources`/`sdk-metrics` 1.30→2.11,
  `sdk-node` 0.57→0.222, `semantic-conventions` 1.28→1.43) — `pnpm audit`'s OTel advisories are now
  gone. **One real breaking change**: `@opentelemetry/resources`'s `Resource` class became a
  type-only export in the 2.x line; `packages/observability/src/tracing.ts`'s
  `new Resource({ [ATTR_SERVICE_NAME]: ... })` no longer compiled (`'Resource' only refers to a
  type, but is being used as a value`) and was replaced with the new factory function,
  `resourceFromAttributes({ [ATTR_SERVICE_NAME]: ... })`. Verified via the full repo-wide static
  checks + test suite (both green) and a live restart of all 4 apps that call `startTracing()` —
  each boots cleanly with tracing/metrics initialized before Nest's own startup log, and an
  authenticated end-to-end request (login → `GET /patients`) still round-trips through the full
  guard/interceptor chain with fastify auto-instrumentation active.
- **`IdentityProvider` refactored for SSO-readiness**, per ADR-0002's own stated intent — no SSO
  vendor is contracted yet (see `docs/ecw-athena-parity-manual-action-items.md`), so this is a pure
  seam-cleaning refactor, not a working integration. `verifyCredentials(tenantSlug, email,
  password)` was split into `resolveUser(tenantSlug, email)` (the only lookup step every provider
  needs — a future SAML/OIDC provider resolves the user from its own signed assertion) and a new,
  separate `PasswordCredentialProvider.checkPassword(userId, tenantId, password)` interface that
  only a password-based provider implements — a federated provider is never forced to accept a
  password at all. `FirstPartyIdentityProvider` implements both; `apps/api`'s `AuthService.login()`
  now calls `resolveUser` then `checkPassword` as two explicit steps instead of one combined call.
  `issueTokens`/`refresh`/`revoke`/`getJWKS`/the MFA methods are unchanged. Verified as a true
  no-behavior-change refactor: full repo-wide lint/typecheck/build (144 tasks) and
  test/test:integration/test:tenant-isolation (114 tasks) green, plus a live restart of `apps/api`
  confirming a correct login, a wrong password, an unknown email, and an unknown tenant slug all
  produce byte-for-byte the same responses as before the refactor.
- **Follow-up fix: authentication failures were returning HTTP 500, not 401** — found while
  verifying the refactor above, pre-existing since `apps/api`'s very first commit, not introduced
  by it. `InvalidCredentialsError`/`InvalidMfaCodeError`/`InvalidMfaChallengeError`/
  `InvalidRefreshTokenError`/`InvalidPortalCredentialsError`/`InvalidPortalRegistrationError` all
  extended plain `Error`, so `ProblemDetailsFilter`'s `classify()` fell through to its generic
  `{status: 500}` branch instead of a real 4xx. Added `UnauthorizedError` (401) to
  `packages/domain-common`'s error taxonomy and made every one of those classes extend it (plus
  `InvalidAccessTokenError`/`InvalidPortalTokenError` for consistency, though those never actually
  surface uncaught — the Fastify auth hooks swallow them). Live-verified: a wrong password, an
  unknown email, an unknown tenant, a malformed refresh token, and a bad portal login now all
  return 401 with a real RFC7807 body instead of 500.

### eCW/athena parity roadmap — Phase M (terminology service v1)

**Built and fully live for both code systems** — RxNorm ended up not needing the download the plan
originally called for; see below.

- **New `packages/terminology`**: `TerminologyService.validateCode(trx, system, code)` and
  `.searchConcepts(trx, system, query)`, dispatched by `system`. `validateCode`'s result carries a
  `checked` flag distinguishing "this code doesn't exist" from "we couldn't check it" (an unloaded
  local system, or an unreachable live request) — the plan's "warn, don't hard-block" requirement
  means those two cases must never look identical to a caller.
- **ICD-10-CM: a one-time bulk load**, same as the plan described. A new global `terminology_codes`
  table (migration `0037_terminology_codes.ts` — no tenant_id/RLS, same posture as the `roles`
  catalog) with a generated `tsvector`/GIN index for real full-text search, same pattern as
  `search_documents`. Loaded from CMS's public, no-account-needed ICD-10-CM flat file via
  `pnpm --filter @ehr/terminology run seed` — **98,403 real codes from the FY2027 release, live**.
- **RxNorm: a live lookup against NLM's free RxNav REST API, not a bulk load** — a deliberate
  deviation from the plan's original "download the RxNorm full release" instruction. That download
  requires a free UMLS Terminology Services account, and this pass's actual attempts to use it hit
  three different real failures in a row (a Google-SSO `InvalidUserCreds`, then an oversized-cookie
  Tomcat crash — "Request header is too large" — after retrying, then "This service is currently
  unavailable" even after switching identity providers to Login.gov). RxNav needs no account, no
  license, and no file to keep current: `GET /rxcui/{code}/properties.json` for `validateCode`,
  `GET /drugs.json?name=...` (filtered to the 4 prescribable term types — SCD/SBD/GPCK/BPCK) for
  `searchConcepts`, both with a 4-second timeout that degrades to `checked: false` rather than
  hanging a prescribing request. This fully replaces the originally-planned bulk RxNorm loader
  (deleted, along with its now-pointless `RXNORM_RRF_FILE` env var) — there is nothing left to
  download or seed for RxNorm; it is unblocked and live today.
- **`GET /api/v1/terminology/search`/`/validate`**, gated on the same `PATIENT_READ_CLINICAL`
  permission `domains/query`'s global search endpoint uses (reference data, not patient data, but
  every real caller already needs that permission to be mid-way through adding a problem or
  prescribing a medication).
- **Wired as an advisory check, not a blocking one**, per the plan: `ProblemService.create()` and
  `MedicationService.create()` (and therefore `PrescriptionService.create()`, which creates the
  underlying medication) now call `validateCode` and return the result alongside the created
  resource — `{problem, codeValidation}` / `{medication, codeValidation}` — without ever rejecting
  the write. Blast radius: 3 call sites across `domains/clinical`/`domains/medication` updated to
  destructure the new shape (same pattern as Phase K's `PrescriptionService` return-shape change).
  Curl-verified end to end: a real ICD-10 code validates with its real description, a bogus code
  still saves with `valid: false`, and a real RxNorm code now validates live against RxNav.
- **Real bug found and fixed while regenerating `docs/api/openapi.json`** for the new endpoints:
  the spec had been stale since Phase K — `Allergy.codeSystem`/`.code` (added by migration `0036`)
  were never reflected because nothing had re-run the generator since. Fixed as a side effect, not
  a separate pass.
- **Also completes the frontend typeahead upgrade** the plan called for: `apps/clinician-web`'s
  add-problem dialog gained a real ICD-10 "search by condition name" typeahead, and the prescribe
  dialog's existing medication-name typeahead now searches real RxNorm data instead of
  `NoopPrescribingGateway`'s 3-item synthetic list, capturing the selected RxCUI into a `rxnormCode`
  field that was previously being discarded entirely. See `apps/clinician-web/lib/
  use-terminology-search.ts` and `components/ui/typeahead.tsx` (extracted from the prescribe
  dialog so both features share it).

### eCW/athena parity roadmap — Phase I follow-up (scheduling UI polish)

Closes the three UI trims the original Phase I pass left open (curl/API-only, not exposed in the
UI) — no backend changes needed, since the server already supported all three:

- **A real "Resources" admin page** (`apps/admin-web/app/(app)/resources/`) — create a room/
  equipment resource against a location, list existing ones. Previously `POST /api/v1/resources`
  had no UI at all. Gated on `APPOINTMENT_MANAGE` (mirrored into `apps/admin-web/lib/
  permission-keys.ts`, matching the backend's own reasoning that a resource has no independent
  business meaning outside scheduling).
- **The New Appointment dialog's location field is now a real dropdown** (fetched from
  `GET /api/v1/locations`, degrading to the original raw-UUID text field if the caller's role lacks
  `LOCATION_MANAGE`), and its resource checkbox list now filters to the selected location's own
  resources instead of showing every resource in the tenant — `GET /api/v1/resources?locationId=`
  already supported this filter server-side; only the frontend wasn't passing it.
- **A recurring series' "Stop by" date** (`recurrence.until`) is now a real form field —
  `RecurrenceSchema` already accepted an optional `until` date; only the dialog never exposed it,
  so a series could only ever be bounded by occurrence count.

Live-verified in a real browser: created a new resource ("Ultrasound Machine A") via the new admin
page and confirmed it appears in both admin-web's list and clinician-web's appointment dialog;
selecting a location with no resources correctly shows "No rooms or equipment are assigned to this
location" instead of an unfiltered list.

### Remaining-gaps build-out — JWT key rotation

Closes item 16 of the post-Tier-2 gap sweep ("do all but vendor gated stuff"): signing keys were
loaded once at process startup and never rotated, with no mechanism to retire a compromised or
aging key without invalidating every session.

- **`packages/auth-adapter`'s `KeyRing`/`KeyRingStore`** (new `src/keyring.ts`) replaces the old
  single `KeyMaterial` load. A `KeyRing` is `{currentKid, keys[]}`, each entry a `KeyMaterial` plus
  `createdAt`; `kid` is a deterministic SHA-256 hash of the public JWK (`computeKid`, already
  existed), not random. `rotateKeyRing()` generates a new current key and prunes anything past
  `retentionMs` (default 7 days) — **except** the just-outgoing current key, which is always kept
  through one more rotation regardless of its own age, so a token signed microseconds before a
  rotation never immediately fails to verify. `loadOrCreateKeyRing()` migrates the pre-existing
  single-PEM-pair files in as the ring's first key when no keyring file exists yet, so upgrading to
  this doesn't invalidate already-issued tokens on deploy. `KeyRingStore` is the mutable, shareable
  holder every consumer actually depends on: it wraps a `KeyRing` plus the keyring file path, and
  every reader calls `.get()` fresh (never captures a `KeyRing` once) so `.rotate()` and
  `.reload()` (a `reloadKeyRing()` poll, `startAutoReload(intervalMs)`) both take effect
  immediately for every holder of that same store instance, no restart needed.
- **A real bug caught by its own test, not shipped**: the first draft of `rotateKeyRing()`'s
  retention filter had an inverted condition — it only kept the outgoing current key when that key
  was *already stale* (past `retentionMs`) and silently dropped it in the normal case (freshly
  created, well within the window), the exact opposite of the documented guarantee. A unit test
  asserting the outgoing key survives one rotation (`packages/auth-adapter/src/keyring.test.ts`)
  failed immediately and pointed at the exact line; fixed by unconditionally keeping
  `previousCurrent` and only using the retention filter for older keys.
- **Blast radius traced before writing code**: `verifyAccessToken`/`verifyMfaPendingToken`
  (`tokens.ts`), `verifyPortalAccessToken` (`portal-tokens.ts`), and `verifySmartAccessToken`
  (`apps/interop-fhir/src/token/smart-token.ts`) all needed their key parameter widened from a
  single `KeyLike` to `KeyLike | JWTVerifyGetKey` — `jose`'s `jwtVerify` supports a lookup-by-`kid`
  callback natively, but TypeScript can't dispatch its two overloads on a union type forwarded as a
  variable (`TS2769: No overload matches this call`), so each file gained a small local
  `asGetKey()` normalizing helper rather than a new shared micro-package (each already has its own
  deliberate zero/minimal-dependency posture). Three separate backend processes each independently
  load key material from the same shared keyring file — `apps/api` (staff + portal tokens),
  `apps/interop-fhir` (SMART tokens only), `apps/interop-hl7` (staff-token verification for HL7
  admin actions) — so each app's `core.module.ts` now provides a `KEY_RING` (`KeyRingStore`) token
  instead of the old `KEY_MATERIAL`, and each starts its own `startAutoReload(KEY_RING_RELOAD_
  INTERVAL_MS)` poll so a rotation performed by any one process reaches the other two (and any
  other replica of the same app) without a restart.
- **New admin endpoint**: `POST /api/v1/auth/keys/rotate` (`apps/api/src/auth/auth.controller.ts`),
  gated on a new `security.key_rotate` permission key (global action — one keyring per deployment,
  not per tenant — so it deliberately checks a platform-level permission rather than being callable
  per-tenant-role). Calls `IdentityProvider.rotateSigningKey()`, which now delegates to
  `KeyRingStore.rotate()` instead of holding its own mutable `KeyRing` field — the Fastify auth
  hooks (`tenant-context.hook.ts`, `portal-context.hook.ts`) and `FirstPartyIdentityProvider` share
  the exact same store instance, so a rotation from this endpoint is visible to `apps/api`'s own
  request-verification path on the very next request, no reload needed for same-process callers.
- New env vars: `JWT_KEYRING_PATH` (default `./.dev/jwt-keyring.json`) and
  `KEY_RING_RELOAD_INTERVAL_MS` (default 60000). The old `JWT_PRIVATE_KEY_PATH`/
  `JWT_PUBLIC_KEY_PATH` stay documented and required — they're the first-boot migration source, not
  dead config.
- **Live-verified** against the running dev stack: logged in, called the new rotate endpoint,
  confirmed `/.well-known/jwks.json` went from 1 key to 2 (new current + retained outgoing),
  confirmed the pre-rotation access token still authenticated a request (`GET /auth/me`), and
  confirmed a fresh login after rotation signs with the new `kid` and authenticates correctly.
  `apps/interop-fhir`'s `/fhir/r4/metadata` and `apps/api`'s portal login endpoint were both
  exercised post-rotation with no disruption. Full repo-wide lint/typecheck/build (102 tasks each)
  and test/test:integration/test:tenant-isolation (98/58/69 tasks) all green, including a new
  rotation-specific integration test (old token verifies after rotation, new token uses the new
  kid, JWKS reflects both keys) and 11 new `keyring.test.ts` unit tests.

### Remaining-gaps build-out — HL7 dead-letter-queue/retry-scheduling

Closes item 15 of the post-Tier-2 gap sweep. `docs/pilot-readiness-checklist.md` called this out
explicitly: HL7 ingestion was idempotent on redelivery (tested), but a failed message just sat
`status='failed'` forever with no automatic retry and no structural dead-letter concept — the only
way it could ever be revisited was the sending interface resending the exact same bytes, and even
then `ingest()`'s idempotency check only replays the stored outcome rather than actually
reprocessing.

- **Permanent vs. transient classification**: new `Hl7PermanentProcessingError`
  (`packages/hl7/src/errors.ts`, alongside the existing `Hl7ParseError`) marks a failure that
  resending the identical bytes can never fix — a missing required field, or no matching
  order/patient/appointment/encounter. Every one of `Hl7IngestionService`'s 16 existing
  `throw new Error(...)` correlation/validation failures (`apps/interop-hl7/src/hl7/hl7.service.ts`)
  now throws this instead. Anything else — an unexpected exception, most plausibly a transient
  database/connectivity failure — defaults to retryable; this default-open classification is
  deliberate, since a codebase with no real interface partner has no way to enumerate every genuine
  transient-failure shape in advance.
- **New `hl7_messages` columns** (migration `0052_hl7_message_retry.ts`): `retry_count`,
  `next_retry_at`, `dead_letter`. A retryable failure schedules `next_retry_at`; a permanent one (or
  a retryable one that has exhausted `HL7_RETRY_MAX_ATTEMPTS`) sets `dead_letter=true` — the
  terminal "a human must look at this, it will never be auto-retried again" signal.
- **`Hl7RetryRelay`** (new `apps/interop-hl7/src/hl7/hl7-retry-relay.ts`), shaped exactly like
  `packages/outbox`'s `OutboxRelay`: `start()`/`stop()` around a `setInterval`, a `running`
  re-entrancy guard, a public `tick()` for tests/manual triggering. Runs **in-process inside
  apps/interop-hl7 itself**, not in `apps/worker` (where `OutboxRelay`/`BulkExportRelay`/
  `BackupScheduler` live) — a deliberate deviation, since actually reprocessing a message needs
  `Hl7IngestionService`'s full dispatch logic and its entire domain dependency graph (`@ehr/orders`,
  `@ehr/results`, `@ehr/patient`, `@ehr/scheduling`, `@ehr/clinical`), which apps/worker doesn't have
  and shouldn't need to duplicate just to run one relay. The relay's cross-tenant due-retries poll
  (`Hl7MessageRepository.claimDueRetries()`) uses a new owner/bootstrap-role `OWNER_DB_CONNECTION`
  (mirroring `apps/interop-fhir`'s existing pattern for its own one cross-tenant need) — same
  justification `OutboxRelay` already documents for why a single tenant-scoped `ehr_app` connection
  can't poll across every tenant in one query. The actual reprocessing of each claimed row, however,
  runs through `withTenantContext` on that same connection, scoped to that row's own tenant. Same
  documented at-least-once caveat as `OutboxRelay`: two concurrent `interop-hl7` replicas could in
  principle both claim the same due row, acceptable since it mirrors an existing, already-accepted
  limitation rather than introducing a new one.
- **A real bug caught by the test suite, not shipped**: `Hl7RetryRelay`'s constructor originally
  took the concrete `Hl7IngestionService` class; extracted a minimal `Hl7Reprocessor` interface (the
  one `reprocess()` method the relay actually calls) specifically so tests could supply a
  deterministic fake (fails N times, then succeeds) instead of driving real HL7 parsing and domain
  writes just to exercise retry/backoff/dead-letter bookkeeping.
- New env vars: `HL7_RETRY_POLL_INTERVAL_MS` (30s), `HL7_RETRY_BATCH_SIZE` (20),
  `HL7_RETRY_MAX_ATTEMPTS` (5), `HL7_RETRY_BACKOFF_BASE_MS` (60s, linear backoff:
  attempt N waits N × this value). Also backfilled `BACKUP_INTERVAL_MS`/`BACKUP_PG_DUMP_PATH` into
  `.env.example`, a pre-existing drift from an earlier item that added them to the schema but not
  the example file.
- **Found and fixed in passing, unrelated to this item**: this session's own local `.env` had
  `JWT_KEYRING_PATH` unset (defaulting to a relative path), which — exactly like the legacy
  `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`'s own documented caveat — resolves to a *different*
  file per app, since `pnpm --filter <app> run dev` runs each app's script with that package's own
  directory as its working directory. `apps/api` (already rotated once during this session's own
  live verification of item 16) and a freshly-started `apps/interop-hl7` ended up with two
  completely disjoint keyrings, so a token apps/api issued failed verification at interop-hl7 with a
  generic 403 until traced to this. Fixed by adding an explicit absolute `JWT_KEYRING_PATH` to this
  machine's local `.env` (gitignored, not a code change) — a running apps/api process started before
  this fix needs a restart to pick it up.
- **Live-verified** against the running dev stack: POSTed a real ORU^R01 message with an
  uncorrelatable order number through `apps/interop-hl7`'s HTTP endpoint and confirmed the resulting
  `hl7_messages` row was dead-lettered immediately (`dead_letter=true`, `next_retry_at=null`,
  `retry_count=1`) rather than scheduled for retry; separately confirmed `Hl7RetryRelay` genuinely
  claims and reprocesses due rows across the live database (it picked up and correctly dead-lettered
  a leftover malformed-message row from this session's own integration-test run within its first
  poll after startup). Full repo-wide lint/typecheck/build (165 tasks) and
  test/test:integration/test:tenant-isolation (131 tasks) all green, including 6 new tests (5 for
  `Hl7RetryRelay`'s retry/backoff/dead-letter/claim-filtering mechanics via a fake reprocessor
  against real Postgres, plus a new dead-letter assertion in the existing ORU ingestion suite).

### Remaining-gaps build-out — operational alerting

Closes item 18 of the post-Tier-2 gap sweep. `docs/pilot-readiness-checklist.md` was explicit:
"`packages/observability` has real OpenTelemetry metrics/tracing scaffolding, but no alerting
pipeline is wired to anything." Three background systems already built in earlier items had zero
human-facing visibility — a scheduled backup job (item 17) could fail silently forever, the outbox
relay's own lag gauge was measured but never acted on, and HL7 dead-letters (item 15) had no
aggregate view.

- **New `packages/alerting`** — a fixed, in-code `AlertRule` catalog (same shape as
  `domains/query`'s governed-query registry): each rule's `evaluate(db)` queries real data and
  returns zero or more `AlertFinding`s. `AlertEvaluator` runs every rule, upserts one open `alerts`
  row per distinct finding (deduped by rule+condition so re-evaluating an already-firing condition
  updates the SAME row instead of spamming new ones — enforced by a real Postgres partial unique
  index, `alerts_open_dedupe_idx`, not just an application-level check), auto-resolves an alert
  whose condition has genuinely cleared, and dispatches exactly one notification — via the same
  `NotificationGateway`/`NoopNotificationGateway` every other vendor boundary in this codebase
  already stubs — the moment an alert newly opens, not on every re-evaluation of one already open.
  `AlertScheduler` is a periodic trigger shaped like `packages/db-backup`'s `BackupScheduler`
  (runs one evaluation immediately on `start()`, then every `ALERT_EVAL_INTERVAL_MS`).
- **Three real rules**, each closing exactly the gap named above:
  - `backup_health` — critical if the most recent `backup_runs` row failed; warning if the most
    recent *succeeded* run is older than `ALERT_BACKUP_STALE_THRESHOLD_MS`.
  - `outbox_backlog` — wires `apps/worker`'s existing `outbox_relay_lag_seconds`/
    `outbox_pending_count` OTel gauges (measured on every collection tick, never acted on) to a
    real warning, using the exact same "oldest pending row's age" query those gauges' own
    collection callbacks already run.
  - `hl7_dead_letter` — one alert per tenant (not one shared platform-wide alert) once that
    tenant's dead-lettered HL7 count meets `ALERT_HL7_DEAD_LETTER_THRESHOLD`, so the finding routes
    to the tenant whose interface engine or reference data actually needs fixing.
- **New global `alerts` table** (migration `0053_alerts.ts`, no `withCommonColumns`/RLS — same
  reasoning as `roles`/`backup_runs`: a rule evaluates conditions across the whole platform, not one
  tenant's data; `tenant_id` is an optional context column on a finding, not a scoping column).
- **New `GET /api/v1/alerts`** (optional `?status=open|resolved`) and
  **`POST /api/v1/alerts/{id}/resolve`** (manual acknowledgement), gated on a new platform-level
  `alert.manage` permission — reads/writes go through the same per-request transaction every other
  route uses (no special system-context wrapping needed, since `alerts` has no RLS policy to
  bypass), same pattern `RoleController` already uses for the equally-global `roles` table. New
  `apps/admin-web` **Alerts** nav page: open alerts with a Resolve button (client component,
  `useTransition` + `router.refresh()`, same shape as `LocationRowActions`' Deactivate button),
  resolved alerts listed below for history. A manually-resolved alert whose underlying condition is
  still firing reopens as a genuinely new alert on the next evaluation — manual ack silences one
  instance, not the rule.
- Wired into `apps/worker/src/main.ts` (where every other background scheduler/relay already
  lives), stopped alongside them in the shutdown handler. New env vars: `ALERT_EVAL_INTERVAL_MS`
  (60s), `ALERT_BACKUP_STALE_THRESHOLD_MS` (48h), `ALERT_OUTBOX_LAG_THRESHOLD_SECONDS` (300),
  `ALERT_HL7_DEAD_LETTER_THRESHOLD` (5), `ALERT_NOTIFY_EMAIL` (empty by default — disables
  notification dispatch; evaluation/persistence happen either way).
- **Live-verified against the running dev stack with genuinely real conditions, not synthetic
  test data**: this dev host has no `pg_dump` binary on `PATH` (a pre-existing, already-documented
  gap from item 17), so the backup scheduler's real attempt failed with `spawn pg_dump ENOENT` —
  the `backup_health` rule correctly opened a critical alert for it on the very next evaluation
  tick. Separately, this session's own accumulated HL7 dead-letters (28 real rows from earlier
  live verification of item 15) correctly triggered a per-tenant `hl7_dead_letter` warning.
  Confirmed `GET /api/v1/alerts` returns both, `POST /api/v1/alerts/{id}/resolve` resolves one with
  a real user id as `resolvedBy`, and — since the underlying backup failure was still the most
  recent run — the SAME condition correctly reopened as a new alert on the following tick (manual
  ack doesn't suppress a still-firing rule, by design). Full repo-wide lint/typecheck/build (168
  tasks) and test/test:integration/test:tenant-isolation (134 tasks) all green, including 21 new
  tests in `packages/alerting` (8 unit — evaluator orchestration and scheduler timing via fakes, no
  real DB — plus 13 integration tests against real Postgres covering the repository's
  upsert/resolve/recur semantics and all three rules).

### Remaining-gaps build-out — clinical safety: dose/unit validation and stale copy-forward tracking

Closes item 19 of the post-Tier-2 gap sweep. `docs/pilot-readiness-checklist.md` named this exact
gap: "Medication dose/unit validation, unit conversion, and stale copied-forward note tracking still
have no control at all" — distinct from Phase K's drug-interaction plumbing (a licensed-vendor
question), these three are genuinely buildable with no vendor gate.

- **New `packages/dose-utils`** — `parseDose()`/`validateDose()`/`convertDose()`, a purely
  structural sanity check (parseable numeric amount + a recognized unit, positive, not wildly
  implausible), deliberately NOT a per-drug clinical dosing check (no licensed drug database exists
  to validate against — same honest-stub reasoning as `packages/interaction-adapter`). Mass
  (mcg/mg/g/kg) and volume (mL/L) units are genuinely interconvertible; count-like units (tablet,
  capsule, patch, puff, drop, spray, "unit" as in insulin dosing, mEq) are each their own isolated
  dimension — a tablet and a capsule are never interconvertible, and "10 units" of insulin has no
  fixed mass equivalent across drugs. 28 unit tests.
- **Wired into `CreatePrescriptionSchema`/`CreateMedicationSchema`** (`domains/medication`): an
  unparseable or non-positive dose is a hard 422 (via Zod `superRefine`, alongside the existing DEA
  schedule/controlled-substance checks); an implausibly large amount only warns — surfaced as a new
  `doseValidation` field on `MedicationService.create()`/`PrescriptionService.create()`'s response,
  same "warn, don't hard-block" shape as this domain's existing RxNorm `codeValidation`. Wired into
  `apps/clinician-web`'s prescribe and add-medication dialogs (a warning banner; the dialog doesn't
  auto-close over it, same pattern as an unrecognized RxNorm code or a real interaction finding).
- **Stale copied-forward-note tracking** (`domains/clinical`'s Note feature): new
  `notes.section_metadata` column (migration `0054`), one entry per `content` key —
  `{source: 'template_default'|'copied_forward'|'edited', copiedFromNoteId?, lastTouchedAt}`.
  `create()` marks a template-default-seeded section `template_default` and a caller-typed one
  `edited`; `updateContent()` diffs old vs. new VALUE per key (it always receives the whole content
  map, not a patch, so a key resent unchanged must not be reclassified as reviewed) and only flips a
  key to `edited` when its value actually changed; `amend()`'s existing full-content copy now starts
  every section `copied_forward` instead of silently looking identical to a freshly-typed one.
  `sign()` returns a non-blocking `staleSections` list (sections still exactly as a template default
  or copy-forward left them) — signing itself is never blocked (real workflows routinely sign a note
  where an unchanged section, e.g. "no relevant family history," is correct as-is), just warned.
- **New `NoteService.createFromPrior()`** — item 19's literal "copy forward" gap: unlike `amend()`
  (which corrects the SAME encounter's already-signed note), this seeds a brand-new note for a
  DIFFERENT (typically later) encounter from an unrelated prior note's content — the everyday "start
  today's note from last visit's" workflow, which had no mechanism at all before this (confirmed via
  research: only template-default seeding and `amend()`'s same-encounter copy existed). Rejects
  copying from a different patient's note (a real safety/privacy check, not just data quality). New
  `POST /api/v1/notes/from-prior`. `apps/clinician-web`'s note editor shows a "Not yet reviewed" /
  "Carried over — not yet reviewed" badge per section and a toast warning naming the stale sections
  if any remain at sign time.
- **Live-verified** against the running dev stack: POSTed a medication with an unparseable dose
  ("500", no unit) and got a real 422 with the exact parse-failure message; a well-formed dose
  ("10 mg") succeeded with an empty `doseValidation.warnings`; an implausible one ("50000 mg")
  succeeded with a real warning message. Confirmed `POST /notes/from-prior` is correctly wired,
  authenticated, and permission-gated (a bogus encounter id returns a real 404, not a 500). The full
  copy-forward/staleness/sign-warning/cross-patient-rejection behavior is exercised end-to-end
  against real Postgres by new tenant-isolation tests (below), since constructing the multi-resource
  fixture (patient/appointment/encounter/prior-note) by hand over curl would just re-derive what
  those tests already prove deterministically. Full repo-wide lint/typecheck/build (171 tasks) and
  test/test:integration/test:tenant-isolation (136 tasks) all green, including `packages/dose-utils`'
  28 unit tests, `domains/medication`'s new DTO-level dose-validation tests (8), and 4 new
  `domains/clinical` tenant-isolation tests covering the full note-staleness lifecycle.

### Remaining-gaps build-out — minor/state-law consent transition mechanism

Closes item 20 of the post-Tier-2 gap sweep, framed exactly as the gap itself: real state-by-state
age-of-majority/age-of-consent legal RULE CONTENT is a business/legal-review question (already
tracked in `docs/ecw-athena-parity-manual-action-items.md` as needing state-by-state counsel), but
the MECHANISM for noticing a proxy grant needs review as a patient ages is a pure engineering
problem with no vendor or legal gate. `domains/consent`'s own README and migration
`0029_patient_proxy_grants.ts` already documented this split explicitly: "Minor/state-law consent
transition rules are explicitly NOT computed here" — `effective_end` existed so staff *could*
time-bound a grant manually, but nothing ever noticed when that mattered.

- **New `packages/age-utils`** (`ageInYears()`) — pure arithmetic, no age-of-majority table or any
  other legal content. Promoted out of `domains/claims`'s `scrub-claim.ts`, which had a private,
  unshared copy of the exact same function for its newborn-diagnosis-code age check; both now use
  the one shared implementation. 7 unit tests (including a leap-year birthday).
- **New `minor_consent_transition` alert rule** (`packages/alerting`, following that package's own
  established `AlertRule` pattern from item 18) — queries `patient_proxy_grants` joined to
  `patients` across every tenant (the same owner-role cross-tenant pattern `hl7_dead_letter` already
  uses), flags an active, non-self, not-yet-expired grant once `ageInYears(patient.dateOfBirth) >=`
  a plain configurable `ALERT_MINOR_CONSENT_AGE_THRESHOLD_YEARS` (default 18 — an honest engineering
  default for "flag this for a human," explicitly documented as never a legal conclusion). The rule
  only detects and flags; it never auto-revokes or auto-extends anything — the actual decision
  (revoke via the already-existing `POST /proxy-grants/:id/revoke`, extend `effectiveEnd`, or leave
  it as clinically/legally appropriate) stays a human call, resolved the same way any other alert is
  resolved (`POST /alerts/:id/resolve`, from item 18's admin-web Alerts page) once reviewed. Wired
  into `apps/worker` alongside the other three alert rules.
- **Live-verified** against the running dev stack: inserted a real patient (age 20, computed from a
  real `date_of_birth`), a real portal account, and a real active `parent` proxy grant directly into
  the dev database; confirmed the rule fired a real alert on `apps/worker`'s next evaluation tick,
  correctly carrying the patient's tenant id and computed age in its detail. Full repo-wide
  lint/typecheck/build and test/test:integration/test:tenant-isolation all green, including
  `packages/age-utils`' 7 unit tests and 5 new integration tests for the rule (fires past threshold,
  does not fire for a minor, does not fire for a self-grant, does not fire for an already-expired
  grant, respects a custom higher threshold).

### Remaining-gaps build-out — authz layers 4, 5, and 8 (resource-relationship, purpose-sensitivity, break-glass)

Closes item 22. Research surfaced that `packages/authz/src/layers/stub-layers.ts` actually stubbed
**5** layers (4-8), not 2 — this repo's `PolicyEngine` implements EHR_BUILD_SPEC.md §6.2's full
8-layer model: tenant membership → user status → role permission → resource relationship → purpose/
sensitivity → consent/proxy → state/special-law → break-glass, with a fixed composition rule ("any
layer can veto with DENY; only role-permission can grant"). Given that composition rule, a real
enforcing layer 4/5 risked a genuine security-relevant behavior change — every practitioner with
`patient.read.clinical` can see every patient in the tenant today, and the whole existing test suite
assumes that. **Explicitly checked with the user before writing any code** given the blast-radius
risk; the agreed scope for all three was "build the real mechanism, keep enforcement off by default
— zero effect on any existing role or route unless someone explicitly opts in."

- **Layer 4 (resource-relationship)** — new `resourceRelationshipLayer` is active ONLY for a new,
  unused-by-default permission key, `patient.read.care_team_scoped` (narrower than
  `patient.read.clinical` — no seeded role grants it). When THAT key is checked, it vetoes unless the
  acting user resolves (via `workforce_identities`) to a practitioner with at least one real
  `encounters`/`appointments` row for the target patient. Every existing role/route is completely
  unaffected.
- **Layer 5 (purpose-sensitivity)** — new nullable `problems.sensitivity` tag (migration 0055; a
  plain tag, not real per-category legal content — e.g. actual 42 CFR Part 2 handling of
  substance-use records is business/legal-review content, out of scope, same as item 20's framing).
  New optional `X-Purpose-Of-Use` request header (`treatment`/`payment`/`operations`), parsed into
  `RequestContext.purpose` — an existing field nothing populated before this. `purposeSensitivityLayer`
  only vetoes `problem.manage` access to a tagged-sensitive problem when a caller EXPLICITLY asserts
  a non-treatment purpose; an absent header (every current caller) defaults to "treatment," so this
  cannot affect existing traffic regardless of which problems get tagged.
- **Layer 8 (break-glass)** — genuinely new, additive capability (not in the original item scope,
  added after confirming with the user it's low-risk since it's purely opt-in). New
  `breakglass_grants` table (migration 0056) implementing spec §6.3 end to end: an explicit
  `POST /api/v1/auth/breakglass` action (reason code + free-text justification, time-limited —
  capped at 4 hours), a real elevated audit event (the invoking request's own `@Audited` entry, which
  captures the reason/justification/patient), and a compliance review queue via a new
  `breakglass_review` alert rule (`packages/alerting`, wired into `apps/worker`) that keeps a
  critical alert open for every un-reviewed grant until `POST /api/v1/auth/breakglass/:id/review`
  closes it. **`PolicyEngine.authorize()`'s composition rule was extended**, carefully, to let an
  active break-glass grant override a contextual DENY from layers 4-7 specifically — a DENY from
  layers 1-3 (tenant membership, user status, role permission) is NEVER overridable, preserving the
  exact pre-item-22 short-circuit behavior for those three untouched. Since layers 4-7 always
  returned `NOT_APPLICABLE` before this item, this composition change has zero observable effect on
  any pre-existing call.
- **Live-verified** against the running dev stack: invoked a real break-glass grant via
  `POST /api/v1/auth/breakglass` for a real patient, confirmed it appears in `GET .../breakglass`,
  confirmed `POST .../breakglass/{id}/review` marks it reviewed, and confirmed the
  `breakglass_review` alert fired for a second, still-unreviewed grant on the next evaluation tick
  and cleared once that one was reviewed too. Full repo-wide lint/typecheck/build (174 tasks) and
  test/test:integration/test:tenant-isolation (138 tasks) all green — including apps/api's own
  golden-path e2e test, which exercises the real `PolicyEngine` pipeline through every existing
  production route and confirms the composition rewrite changed nothing for them. 28 new tests
  across `packages/authz` (unit: policy-engine override logic, each new layer in isolation;
  integration: real encounters/appointments/problems/breakglass_grants against Postgres, plus a
  full 8-layer end-to-end override test) and `packages/alerting` (the new review-queue rule).

### Remaining-gaps build-out — SSO/SAML/OIDC identity federation adapter shape

Closes item 23. ADR-0002 already anticipated this: `IdentityProvider.resolveUser(tenantSlug, email)`
was deliberately split from password verification (`PasswordCredentialProvider.checkPassword`) so "a
future SAML/OIDC provider resolves the user from its own signed assertion and never needs
`checkPassword` at all" — that seam existed but nothing used it. No real IdP is integrated (and none
can be without choosing and contracting one), so this closes the shape only: the full federated-login
request path is real and wired end to end, but cannot actually authenticate anyone until a real
SAML/OIDC verifier is plugged in.

- **`packages/auth-adapter/src/sso.ts`** (new) — `SsoAssertionVerifier` interface
  (`verify(rawAssertion, config): Promise<VerifiedSsoAssertion>`) plus `NoopSsoAssertionVerifier`.
  Unlike this repo's other `Noop*Gateway` stubs (which return an empty/successful result so a
  downstream flow can be demoed, e.g. `NoopPaymentGateway` always succeeding), an identity verifier
  that trivially "succeeded" would let anyone log in as anyone it named — so this one ALWAYS REJECTS,
  fail-closed, regardless of input. It exists to prove the request path is real, not to authenticate
  anyone.
- **`packages/db/migrations/0057_tenant_sso_configs.ts`** (new) — one row per tenant (`protocol`,
  `enabled` defaulting false, `issuer`, `clientId`, `metadataUrl`), tenant-scoped and RLS-enabled.
  Nothing calls it until a tenant admin explicitly configures + enables one. New `sso.manage`
  permission (tenant-scoped, like `tenant.manage` — no seeded role has it besides `platform_admin`)
  gates `GET`/`PUT /api/v1/auth/sso/config`.
- **`packages/db/migrations/0058_external_identities.ts`** (new) — links a verified assertion's
  external subject id to an existing local `users` row. Deliberately **link-only, never
  provisioning**: `FederatedIdentityProvider` only ever links to a `users` row that already exists
  (JIT-matched by email on first login, then by this table's persisted link on every login after) —
  it never creates a user or grants a permission, so enabling SSO for a tenant can never itself
  expand who can log in, only how an already-provisioned person does it.
- **`packages/auth-adapter/src/federated-identity-provider.ts`** (new) — `FederatedIdentityProvider`
  is a sibling of `IdentityProvider`, not a second implementation of it: `resolveUser(tenantSlug,
  email)`'s signature assumes the caller already knows the email, which isn't true for a federated
  callback starting from an opaque provider-issued assertion. Everything downstream of identity
  resolution (`issueTokens`, refresh, JWKS, MFA, key rotation) is already provider-agnostic and reused
  as-is through the same `FirstPartyIdentityProvider` instance once `authenticate()` returns a
  `ResolvedUser`. Every failure — unconfigured tenant, disabled config, no registered verifier, a
  rejected assertion, no matching local user — is normalized to the exact same opaque
  `SsoAuthenticationError` message, the same "don't reveal which reason" posture password login
  already uses for wrong email vs. wrong password.
- **New endpoint**: `POST /api/v1/auth/sso/callback` (`AuthController`, unauthenticated like
  `login()`) — body `{tenantSlug, protocol, assertion}`; `assertion` is deliberately `z.unknown()`
  since its real shape depends entirely on which protocol/IdP eventually verifies it. Reuses
  `AuthService`'s exact MFA-gate/token-issuance/audit shape (`ssoLogin()` mirrors `login()`).
- **Live-verified** against the running dev stack: enabled a real OIDC config for a tenant via
  `PUT /api/v1/auth/sso/config`, confirmed `POST /api/v1/auth/sso/callback` fails closed with the
  opaque 401 (proving the config lookup → verifier call path is real), confirmed a tenant with no
  config at all gets the exact same opaque message (no information leak about which tenant has SSO
  configured), and confirmed ordinary password login is completely unaffected throughout. 12 new
  integration tests (`packages/auth-adapter`) against real Postgres cover: no-config, disabled-config,
  no-registered-verifier, no-matching-user, first-login JIT-linking, link-reuse on a second login,
  and cross-tenant isolation (a config enabled for tenant A can't authenticate against tenant B) —
  plus 3 unit tests proving `NoopSsoAssertionVerifier` rejects every input shape. Full repo-wide
  build/lint/typecheck green; the one test failure seen in a full-suite run
  (`@ehr/query`'s tenant-isolation reindex test hitting its known pre-existing 5-second timeout under
  heavy concurrent load) passed cleanly in isolation, confirming it's unrelated.

### Remaining-gaps build-out — SMART EHR launch

Closes item 24. Migration 0049 already deliberately deferred this ("EHR launch... needs to be
embedded inside a host EHR's own UI with a launch-context token — a different, larger feature");
this closes it now that the rest of the launch machinery (standalone launch, key rotation, bulk
`$export`) already exists.

- **`packages/db/migrations/0059_smart_client_launch_uri.ts`** (new) — a nullable `launch_uri` on
  `smart_clients`: the URL the EHR redirects a clinician's browser to when starting a launch. Null
  means a client simply isn't EHR-launchable — every client seeded before this item is unaffected.
- **`packages/db/migrations/0060_smart_ehr_launch.ts`** (new) — new `smart_launch_contexts` table
  (tenant-scoped, RLS-enabled), keyed by an opaque `launch` id; `smart_authorization_codes` gains
  optional `encounter_id`/`launched_by_user_id` and `portal_account_id` becomes nullable (an
  EHR-launch code has no portal account at all).
- **New `POST /api/v1/patients/:id/smart-launch`** (`apps/api`) — a clinician viewing a patient's
  chart mints a launch context (gated on `PATIENT_READ_CLINICAL`, same reasoning `POST
  /practitioners/names` used: handing a registered app the same context a clinician already has
  legitimate read access to grants nothing new) and gets back the app's `launch_uri` with `iss`/
  `launch` query params to navigate to. New `GET /api/v1/smart-clients` lists which clients are
  EHR-launchable for the caller's tenant.
- **`AuthorizeController`'s new `launch`-param branch** (`apps/interop-fhir`) — when the app's own
  `/authorize` request carries `launch`, this validates `aud` matches the FHIR base URL (per spec),
  resolves the single-use launch context, checks requested scopes against the client's allowlist,
  and mints a `smart_authorization_codes` row directly — skipping `apps/patient-portal`'s consent/
  picker UI entirely, since the context is already fixed by the EHR and the clinician already had
  legitimate access to it. From there, token exchange is identical to standalone launch: the same
  `TokenService`/PKCE/single-use-code machinery, now also propagating an optional `encounter` claim
  end to end (`smart-token.ts`, the token response, `apps/api`'s originating endpoint).
- **`.well-known/smart-configuration`** now declares `launch-ehr` alongside `launch-standalone`,
  and lists the `launch` scope.
- **Live-verified** against the running dev stack, playing both sides of a real EHR launch: minted
  a launch context from a patient's chart via `POST .../smart-launch`, fed the returned `launch` id
  into a real `GET /authorize` call (as a third-party app would), confirmed it redirected straight
  back with a code with no consent step, exchanged that code at `/token` and confirmed the access
  token's `patient` claim matched the chart it was launched from, used that token to fetch the real
  FHIR `Patient` resource, and confirmed replaying the same `launch` id a second time is rejected
  (single-use). Also clicked the new "Launch app" button on a real patient chart in
  `apps/clinician-web` and confirmed it triggers the same mechanism (a genuine cross-origin
  navigation attempt to the registered `launch_uri`). 18 new/updated integration tests
  (`apps/interop-fhir`, real Postgres): `aud` mismatch, unknown/expired/already-consumed launch
  contexts, disallowed scope, a full successful launch-to-code-to-token walkthrough, and encounter
  context propagating through to both the code and the signed token. Full repo-wide build/lint/
  typecheck/test/test:integration/test:tenant-isolation green aside from the same known pre-existing
  `@ehr/query` flaky timeout (confirmed passing in isolation).

### Remaining-gaps build-out — real C-CDA/PDF records export

Closes item 25. The patient portal's "Download my records" already produced a real, complete
bundle (demographics + active problems/allergies/medications + signed notes + released results) —
the documented gap was the delivery *format* (a bare JSON dump), not missing data.

- **`domains/portal/src/export/ccd-generator.ts`** (new) — a structurally real HL7 CDA R2 document
  following the C-CDA "Continuity of Care Document" (CCD) template: real document- and
  section-level `templateId`s, LOINC section codes, and real patient clinical data throughout, not
  a fabricated sample. Honestly scoped: it has NOT been run against the official C-CDA/NIST
  validation tooling (a licensed/hosted validator this environment has no path to), so full
  national-standard conformance isn't claimed — same honesty bar as `packages/dose-utils`. A code
  under a system this generator doesn't have a real HL7 OID for (any string is accepted by the
  existing DTOs) gets an honest `nullFlavor="OTH"` + original text rather than a fabricated OID.
  Deliberately has no Immunizations section (no immunization domain/table exists anywhere in this
  repo — an honest omission) and no clinical-notes section (CCD has no such section; notes remain
  available via JSON/PDF instead).
- **`domains/portal/src/export/pdf-generator.ts`** (new) — a real, human-readable PDF clinical
  summary via `pdfkit` (pure JS, no headless-browser/native-binary dependency — this repo already
  has one documented binary-dependency pain point, `packages/db-backup`'s `pg_dump`, not worth a
  second). Includes signed notes, which CCD's rigid schema has no place for.
- **`packages/db/migrations/0061_export_requests_format.ts`** — `export_requests.format` (`'json'`
  default) records which format a request produced; every existing/future JSON-only caller is
  unaffected.
- **`POST .../export-requests?format=json|pdf|ccd-xml`** (`domains/portal`) — `format` defaults to
  `json`, so the existing endpoint contract is unchanged for any caller that doesn't pass it.
  `apps/patient-portal`'s "Download my records" panel now offers all three as separate buttons.
- **Verified**: 9 new unit tests (`ccd-generator.test.ts` validates real well-formed XML via
  `fast-xml-parser`, confirms the CCD templateId/LOINC document code, confirms a recognized code
  system maps to its real OID, confirms an unrecognized one honestly falls back instead of
  fabricating one, confirms no Immunizations section exists; `pdf-generator.test.ts` confirms real
  `%PDF-` magic bytes) plus 3 new integration tests against real Postgres
  (`domains/portal/test/tenant-isolation.spec.ts`) exercising `PortalExportService.requestExport`
  end to end for all three formats with real clinical data (a real problem, allergy, and
  medication), confirming the right content-type/format is recorded and the real generated
  bytes/XML contain that real data. **Could not complete a live HTTP round-trip through this
  environment's object-storage step**: this sandbox has no path to pull the `minio/minio` image
  (`docker compose up minio` fails with a registry access-denied error, a sandbox-level constraint,
  not a defect in this feature — the same class of gap this README's own "Verification status"
  section already documents for Docker Desktop itself) — so end-to-end HTTP verification relies on
  the real-Postgres integration tests above instead, which exercise the exact same service method
  end to end aside from the final S3 `putObject` call. Full repo-wide build/lint/typecheck/test/
  test:integration/test:tenant-isolation green (262 tasks) aside from the same known pre-existing
  `@ehr/query` flaky timeout.

### Remaining-gaps build-out — optimistic UI (`useOptimistic`)

Closes item 26, the last item of this build-out. Every interactive button across
`apps/clinician-web`/`apps/admin-web`/`apps/patient-portal` followed the same shape: disable the
control, await a Server Action round trip, then `router.refresh()` a full page-data reload — no
optimistic UI anywhere. React 19 (already in use in all three apps) ships `useOptimistic` for
free, so this needed no new dependency; it's the first use of that hook in this codebase (the team
already reaches for React 19's `useActionState` in ~18 create-dialogs, just not `useOptimistic`
yet). Converted one representative, low-risk, single-status-change interaction per app rather than
a wholesale rewrite (~30 `useTransition` call sites exist across the two heavier apps):

- **`apps/admin-web/components/billing-rules/toggle-rule-status-button.tsx`** — a boolean
  active/inactive toggle now flips its own label instantly instead of waiting on the round trip.
  `updateBillingRuleStatus` already calls `revalidatePath` on success, so `router.refresh()` was
  redundant and is gone; on failure `useOptimistic` automatically reverts once the transition ends.
- **`apps/clinician-web/components/tasks/tasks-table.tsx`** — fixed a real bug in passing: a
  single shared `isPending` disabled every row's action buttons while ANY one row's action was in
  flight, not just the row being acted on. `useOptimistic` over the task list flips the acted-on
  row's status immediately (hiding just its own buttons) while every other row stays fully
  interactive the whole time.
- **`apps/patient-portal`** — replaced `CancelAppointmentButton` (which had zero visible effect on
  the appointment's status badge until the full round trip completed) with a new
  `components/appointments/appointment-row.tsx` that flips the status badge to "cancelled" and
  hides the cancel action the instant confirm is clicked.
- **Live-verified** against the running dev stack for all three: clicked each control and confirmed
  the UI updated before a full round trip could plausibly complete, confirmed the real Server
  Action POST fired and returned 200, and confirmed a hard page reload afterward showed the exact
  same state the optimistic update had already shown (real persistence, not just local optimism).
  For the tasks-table fix specifically, confirmed a second, unrelated open task's buttons stayed
  fully enabled (`disabled: false`) the entire time the first task's completion was in flight,
  proving the shared-pending bug is actually fixed. Full repo-wide build/lint/typecheck/test/
  test:integration/test:tenant-isolation green aside from the two already-documented pre-existing
  flakes (`@ehr/clinician-web`'s typecheck/`next build` Turbo race, `@ehr/query`'s tenant-isolation
  timeout) — both confirmed passing standalone.

This closes the "do all but vendor gated stuff" remaining-gaps build-out — all ~28 items are now
either DONE or explicitly excluded as vendor/business-gated.

## Epic-parity build-out

After the remaining-gaps build-out finished, a fresh gap analysis compared this system against
Epic Systems (the dominant real-world EHR, used mostly by large hospital systems) rather than
eClinicalWorks/athenahealth. Most of Epic's surface area is either fundamentally out of scope
(inpatient/hospital modules — ED, OR/perioperative, OB, pharmacy dispensing, a lab instrument
interface/LIS — this system is explicitly ambulatory-only) or network-effect/vendor-gated (Care
Everywhere's HIE, the Cosmos research data pool, the App Orchard/Showroom app marketplace's
installed-base scale). What remained genuinely buildable: a population explorer/cohort-builder UI,
a population-health module, patient-facing AI, a SMART-app marketplace catalog, and a genomics
domain. User said "do 3, we are going for full service" — building all of them with the same
discipline as every prior build-out.

### Item 1 — self-service population explorer / visual cohort builder (SlicerDicer-equivalent)

The visual cohort builder already existed with zero prior notice taken of it (a row-based condition
builder, save/run/history/export, and a stubbed NL-to-DSL assistant) — the real gap was DSL/compiler
flexibility, a live count while editing, and result visualization, not "no frontend at all."

- **`domains/query/src/cohort/cohort.dto.ts`** — the DSL gained four new `concept` types
  (`encounter`/`appointment`/`coverage`/`note`, existence-style matches) and a generalized
  `latest_observation_value` measure (any LOINC code, replacing the old HbA1c-only limitation —
  `latest_hba1c` itself stays valid for backward compatibility with any previously-saved cohort).
  Every original condition shape still parses and compiles identically.
- **`cohort-compiler.ts`** — a new `compileBreakdown()` slices the same matched population by one
  safe, closed-enum dimension (`sex_at_birth`/`age_bucket`/`active_condition_code`) and returns
  aggregate bucket counts only, never a patient-id list — the same minimum-necessary posture
  `compileAndRun` already documents.
- **New `POST /api/v1/cohorts/preview`** — a live, unpersisted count as a filter set is being
  edited (debounced 500ms client-side); unlike `execute`, it never writes a `cohort_executions`
  row, so it can safely fire on every edit. **New `POST /api/v1/cohorts/breakdown`** — the slice
  endpoint.
- **`apps/clinician-web`'s `CohortBuilder`** — extended with the new row types, a live "N matching
  patient(s)" count that updates as filters change (no more click-Run-and-wait), and a "Slice this
  population by" control rendering a small dependency-free horizontal-bar chart
  (`cohort-breakdown-chart.tsx` — plain divs, no charting library).
- **Live-verified** against the running dev stack: real preview/breakdown calls against real data
  (896 matching patients on a broad age filter, a real sex-at-birth and active-condition-code
  breakdown), the new concept types and generalized measure all matched real fixture data
  correctly, and the live debounced count was confirmed updating in the actual browser (826
  matching patients appeared automatically after typing, with no Run click). 22 new tests (9 unit +
  4 new integration cases in `domains/query`'s existing cohort suite, covering all four new
  concepts, the generalized measure, `preview`'s non-persistence, and `breakdown`'s three
  dimensions).

### Item 2 — population health module (Healthy Planet-equivalent care-gap worklist)

A "registry" turned out not to need a new data model at all — a saved `Cohort` (item 1) already
*is* "a named rule producing a patient list, re-runnable, with execution history." What a real
care-gap worklist needed was orchestration: periodic evaluation and an actionable, resolvable work
item per patient — both map directly onto `packages/alerting`'s existing `AlertRule`/
`AlertEvaluator`/`AlertScheduler` mechanism (built for item 18's operational alerting), so this
needed zero new persistence or scheduling infrastructure.

- **`packages/alerting/src/rules/care-gap-hba1c.rule.ts`** and **`care-gap-wellness-visit.rule.ts`**
  (new) — the per-patient companions to the existing `quality_measure_diabetes_hba1c_control`/
  `quality_measure_annual_wellness_visit` governed queries, which already prove these populations
  are computable but collapse them to an aggregate rate. These mirror the identical SQL logic and
  emit one `AlertFinding` per gapped patient (`dedupeKey: patientId`) instead of a count. Both
  windows are plain configurable engineering defaults (`ALERT_CARE_GAP_HBA1C_LOOKBACK_DAYS`/
  `ALERT_CARE_GAP_WELLNESS_VISIT_LOOKBACK_DAYS`, both 365), not a certified HEDIS/NCQA measure
  specification — wired into `apps/worker`'s existing `AlertEvaluator` alongside every other rule.
- **New `apps/api/src/care-gaps/` module**, deliberately NOT the existing generic
  `/api/v1/alerts` endpoints, for three real reasons: (1) permission model — `ALERT_MANAGE` is a
  platform-admin ops concern (backup health, outbox backlog); a care-gap worklist is a clinical
  workflow for practicing staff broadly, gated on a new `CARE_GAP_MANAGE` instead; (2) tenant
  isolation — `alerts` has no RLS (migration 0053), and the generic list endpoint doesn't filter by
  tenant at all (a real pre-existing gap — harmless for platform-wide findings, not for
  patient-linked ones — flagged separately rather than silently patched here, since it's out of
  this item's scope); every read/resolve here is explicitly scoped to the caller's own tenant via
  a new `AlertRepository.listOpenByTenantAndRuleKeys`; (3) shape — patient-grouped with a resolved
  patient name, not a flat rule-agnostic row.
- **`apps/clinician-web`'s new `/care-gaps` page** — reuses item 26's `useOptimistic` pattern (same
  session) for the same reason `TasksTable` needed it: resolving one patient's gap shouldn't affect
  any other row.
- **Live-verified** end to end against the running dev stack: the worker's `AlertScheduler` picked
  up both new rules on its very first tick and opened real, genuinely-computed findings against
  real dev-DB fixture data; confirmed tenant isolation directly (tenant B's admin saw only its own
  16 care gaps, never tenant A's, even by patient id); resolved a real finding via the API and
  confirmed it disappeared from the worklist while a fresh one took its place at the 500-row cap
  (proving the round trip is real, not just client-side optimism); clicked "Resolve" in the actual
  browser UI and confirmed the same. 8 new integration tests (4 per rule) plus a new
  `AlertRepository.listOpenByTenantAndRuleKeys` cross-tenant-isolation test (28 total in
  `packages/alerting`'s suite, up from 20).
- **Found in passing, flagged as a separate follow-up (not fixed here, to keep this item's scope
  tight)**: `AlertsController.list()`'s pre-existing lack of tenant filtering, above.

### Item 3 — patient-facing AI ("Emmie"-equivalent), reframed responsibly

No LLM vendor is connected (`docs/adr/0004-deferred-ai-vendor.md`), so this is deliberately **not** a
live unsupervised chatbot. Two narrower, honest capabilities: AI-drafted lab-result explanations that
only ever reach the patient after a human explicitly accepts them, and a plain pre-visit agenda note
(not AI at all — just a UX gap being closed).

- **Lab-result explanations reuse the existing generic AI propose→review pipeline** (the same one
  used by all 8 other `domains/ai` features) rather than inventing a parallel mechanism — a new
  `lab_result_explanation` feature (migration `0062`, widening the `ai_generations_feature_check`
  allowlist) and a `lab-result-explanation-v1` prompt template on the existing `NoopAiGateway` honest
  stub. The one new field, `ai_generations.linked_diagnostic_report_id`, follows the precedent of
  `linked_cohort_execution_id` but is set directly at `propose()` time rather than after `accept()`,
  since (unlike a cohort execution) the diagnostic report already exists before the generation does.
- **The patient-facing read never has a "draft" state to leak**: `AiGenerationRepository
  .findAcceptedByLinkedDiagnosticReport()` only ever returns rows with `status IN ('accepted',
  'accepted_with_edits')` — a `pending` or `rejected` explanation is structurally invisible to
  `PortalChartService.getResultExplanation()` no matter what, the same "never show unreviewed AI
  output to a patient" posture every other AI feature's human-review gate already has.
- **Pre-visit agenda capture** — a new `patient_agenda`/`patient_agenda_updated_at` column pair on
  `appointments` (migration `0063`), modeled directly on `cancellation_reason`'s existing
  single-purpose-free-text-column precedent since there's no edit-history requirement for one
  pre-visit note. Patient-only write (`PortalChartService.updateAppointmentAgenda`, with the same
  ownership re-check as `cancelAppointment`); staff see it read-only in the schedule table.
- **`apps/clinician-web`** — a "Explain for patient (AI)" trigger on each result row
  (`results-list.tsx`), reusing the existing `AiProposeTrigger`/`AiGenerationReview` components
  unchanged; the schedule table shows a patient's agenda note (if any) under the appointment type.
  **`apps/patient-portal`** — the results tab shows the accepted explanation text under its report
  (only once accepted); the appointments tab has an inline "what would you like to discuss" editor
  for upcoming (`scheduled`/`confirmed`) appointments.
- **Live-verified** end to end against the running dev stack: proposed a real explanation via the
  clinician-web UI and confirmed the generic review panel rendered pending/Accept/Reject with correct
  grounding metadata; confirmed via direct API calls that the portal-facing lookup returns `null`
  before acceptance and the exact edited text after; registered a real patient-portal account and
  confirmed the accepted explanation renders on the patient's own results page and nowhere before
  that; set a pre-visit agenda as a patient in the actual browser UI and confirmed the same text
  round-trips through `GET /api/v1/appointments` on the staff side. 9 new tests (3 in `domains/ai`,
  2 in `domains/scheduling`, 4 in `domains/portal`) — all in the domains' existing tenant-isolation
  suites (18/16/24 total passing in each package, up from 15/14/20).

### Item 4 — SMART-app developer/marketplace catalog (App Orchard/Showroom-equivalent)

Scoped to what's actually buildable: `smart_clients` is tenant-scoped with RLS (verified before
building anything), so a real cross-tenant app directory would need vendor submission/certification
— network-effect/vendor-gated, the same reasoning that excluded Care Everywhere/Cosmos. What this
item builds instead is honest to that constraint: a **per-tenant** catalog of the SMART apps a
practice has registered, not a shared marketplace.

- **`smart_clients` gained four catalog display columns** (migration `0064`): `description`,
  `developer_name`, `website_url`, `logo_url` — the table previously had only `display_name`, so
  there was nothing to actually render in a catalog view.
- **New `apps/api/src/smart-ehr-launch/smart-client-admin.controller.ts`** — full admin CRUD
  (`GET/POST /api/v1/smart-clients/admin`, `PATCH .../:id`, `POST .../:id/{activate,deactivate}`),
  deliberately a separate path from the existing `GET /api/v1/smart-clients` launch-picker endpoint
  (different permission model, different response shape — see that endpoint's own doc comment)
  rather than repurposing it. Raw Kysely in the controller, no new repository/service layer, matching
  `SmartEhrLaunchController`'s existing style for this same table. Gated on `API_MANAGE_CLIENTS` — an
  existing permission key that had been defined since an earlier build-out but was never actually
  wired to anything, rather than minting a new one.
- **Real client-secret issuance**: `create()` generates a random client id + a 32-byte secret, hashes
  it with the identical `argon2.argon2id` call the token endpoint already uses to verify SMART client
  credentials (`apps/interop-fhir/src/token/token.service.ts`), and returns the plaintext secret in
  that one response only — never retrievable again, never present in any later read.
- **`apps/admin-web`'s new `/smart-apps` page** — an app-store-style card grid (logo, developer,
  description, scopes, status) rather than a flat table, since "catalog" is the actual UX goal here;
  a register dialog collects the descriptive fields plus scopes/redirect URIs/launch URL, then swaps
  to a one-time secret-reveal screen with copy buttons; each card has Edit (descriptive fields) and
  an Activate/Deactivate toggle.
- **Live-verified** against the running dev stack: registered a real app through the actual browser
  UI, confirmed the one-time secret-reveal dialog rendered with a real 64-hex-char secret, confirmed
  the app then appeared in the grid; toggled it to Inactive through the UI and confirmed the badge and
  button both flipped correctly; confirmed via direct API calls that the endpoint returns real seeded
  and newly-created rows and that the stored hash verifies against the returned plaintext secret via
  `argon2.verify`. 3 new integration tests in `apps/api` (secret generation/verification, tenant
  isolation on update/deactivate, the update/deactivate/activate state-transition guards).

### Item 5 — genomics domain (discrete coded genomic test results)

Explicitly scoped to what's real: discrete, coded genomic test results (e.g. a pharmacogenomic
panel's per-gene phenotype, or a hereditary-cancer gene-panel finding) — **not** a sequencing
pipeline and **not** raw VCF/FASTQ handling, since no genomics lab partner exists. Confirmed nothing
genomics-related existed anywhere in the repo before building (a plain grep for
genomic/genetic/HGVS/ClinVar/PharmGKB/CPIC turned up only this build-out's own planning prose).

- **New `domains/genomics`**, modeled directly on `@ehr/results`' `DiagnosticReportService` — the
  same encounter-scoped report shape, the same additive-amendment pattern (`amend()` creates a new
  row via `amendsReportId`, the original is never mutated), the same `reviewStatus` gate for portal
  visibility (`listReleasedByPatient` excludes `'pending'`). One deliberate departure: individual
  findings get their **own** table (`genomic_findings`, migration `0065`) rather than reusing
  `@ehr/clinical`'s generic `observations` the way diagnostic reports do — a finding's natural
  fields (gene symbol, HGVS variant notation, ClinVar-style clinical significance, a CPIC-style
  phenotype category) don't fit `observations`' generic code/display/value shape, and forcing them
  in would lose exactly the discrete structure this item exists to provide. No HGVS/ClinVar/PharmGKB
  code-system precedent existed to constrain against, so `hgvsNotation`/`phenotypeCategory` stay
  loose free text, matching `diagnostic_reports.code_system`/`code`'s own established convention.
- **A pathogenic/likely-pathogenic finding automatically opens a durable `Task`**
  (`taskType: 'genomic_finding_review'`), the same "durable workflow task, not a transient
  notification" treatment `diagnostic_reports`' critical-flag rule already gives lab results — a
  benign-only report opens nothing.
- **`apps/clinician-web`** — a new "Genomics" chart tab (`GenomicsList`) showing each report's
  findings inline (gene, HGVS notation, a color-coded significance badge, phenotype, interpretation)
  with the same Mark-reviewed/Acknowledge actions as `ResultsList`; a "Record genomic result" dialog
  on the encounter workspace (mirrors `RecordResultDialog`'s add/remove-row pattern) lets staff add
  one or more findings to a new report.
- **`apps/patient-portal`** — a new "Genomics" tab on the records page showing only
  reviewed/acknowledged reports and their findings, via a new `PortalChartService
  .listGenomicReports()` (same consent-gated `assertAccess` posture as every other portal read).
- **Live-verified** end to end against the running dev stack: recorded a real two-finding report
  (one pathogenic, one benign) via a direct API call, confirmed the pathogenic finding alone opened
  a `genomic_finding_review` Task; confirmed the report was invisible to a real registered
  patient-portal account until reviewed, then visible with both findings intact; confirmed the same
  in the actual browser UI on both `clinician-web` (chart tab renders gene/HGVS/significance/
  interpretation, review action works) and `patient-portal` (records tab shows the released report
  and both findings only after review). 6 new tests in `domains/genomics/test/tenant-isolation.spec.ts`
  plus 2 new tests in `domains/portal`'s existing suite (26 total, up from 24).

## Verification status

Docker Desktop's backend would not start in the environment this was built in (its WSL2
integration was crash-looping on a corrupted socket file — a local machine issue, not a project
one), so initial development verified everything it could without it (full build/typecheck/lint/
unit tests, a live NestJS DI bootstrap, `/healthz`, `/.well-known/jwks.json`, a 403 for
unauthenticated requests) but left migrations, seeding, and the `test:integration`/
`test:tenant-isolation` suites unverified against a real database.

That gap has since been closed — using a temporary Docker-free Postgres (the `embedded-postgres`
npm package; equally, `docker compose up -d` works the same way once Docker is available) rather
than waiting on Docker further. Doing this for the first time surfaced several real bugs pure
typechecking couldn't have caught (a Windows-only ESM path bug in the migrator, an unrecognized
`citext` column type, `turbo.json` silently dropping `DATABASE_URL` from task environments, a
test harness that connected as the RLS-bypassing owner role instead of `ehr_app` — so tenant
isolation was never actually being exercised by its own tests, and a NestJS+Fastify middleware
incompatibility that meant `req.ehrContext` was being set on an object nothing downstream ever
read). All are fixed — see that commit's message for the full list.

Currently verified live, end to end, against a real Postgres: all 7 Phase 1 migrations, seeding,
the full `test`/`test:integration`/`test:tenant-isolation` suite (73/73 Turborepo tasks) with
Row-Level Security genuinely exercised (not just each repository's own `where tenant_id = ...`
filter), and a full HTTP walkthrough — login, organization/location creation, listing, a
cross-tenant read correctly returning 404 (never leaking that the row exists under another
tenant), an unauthenticated request returning 403, every action landing in `audit_events` with
the correct actor/outcome, every domain write landing in `outbox_events`, and `apps/worker`
relaying all of them to `published`.

**Phase 2** was verified the same way (`docker compose up -d` once Docker is available, or the
same Docker-free `embedded-postgres` workaround): migrations `0008`–`0012` apply cleanly, the
full `test`/`test:integration`/`test:tenant-isolation` suite is green across all four new
packages (`@ehr/patient`, `@ehr/scheduling`, `@ehr/tasks`, `@ehr/intake`), and a full HTTP
walkthrough covering the whole Phase 2 golden path: patient registration, adding an identifier
and a coverage, booking → confirming → checking in an appointment, creating and completing a
task, creating an intake template and submitting a response, reading the patient timeline
(correctly aggregating the appointment and task), running the duplicate-candidate search against
two similar patients (scored 70/100 on exact DOB + name match), merging them, and reversing that
merge — every step producing the expected `audit_events`/`outbox_events` rows, with cross-tenant
reads correctly returning 404 throughout.

**Phase 3** was verified the same way: migrations `0013`–`0017` apply cleanly on top of Phase
2's, the full `test`/`test:integration`/`test:tenant-isolation` suite is green across both new
packages (`@ehr/clinical`, `@ehr/medication`) and the extended `@ehr/documents`, and a full HTTP
walkthrough continuing the Phase 2 golden path from a checked-in appointment: creating an
encounter → starting it → recording vitals (observations) and a procedure → recording a problem
and an allergy → moving into documentation → creating a note template → creating a note from it
→ editing/submitting/signing the note → **amending the signed note and confirming the original's
content is byte-for-byte unchanged** (`GET /notes/{id}` shows the original plus its amendment
chain) → recording a medication and a reconciliation event → uploading a patient/encounter-linked
document → signing the encounter → sending it to coding review — every step producing the
expected `audit_events`/`outbox_events` rows, with cross-tenant reads correctly returning 404
throughout, and the encounter-creation state gate (`checked_in` appointments only) and note
sign/void state-machine rules verified as real 409 conflicts, not just documentation.

**Phase 4** was verified the same way: migrations `0018`–`0021` apply cleanly on top of Phase 3's,
the full `test`/`test:integration`/`test:tenant-isolation` suite is green across all five new
packages (`@ehr/orders`, `@ehr/results`, `@ehr/hl7`, `@ehr/fhir-mapping`, `@ehr/lab-adapter`), the
two new apps (`@ehr/interop-fhir`, `@ehr/interop-hl7`), and the extended `@ehr/clinical` (131/131
Turborepo tasks), and a full HTTP walkthrough exercising all three apps together: placing an order
and collecting a specimen (`apps/api`) → posting a synthetic `ORU^R01` HL7 message to
`apps/interop-hl7` and confirming the resulting `diagnostic_report` and linked `observations`
rows landed → confirming a critical result automatically created a `Task`
(`taskType: 'critical_result_review'`, `priority: 'urgent'`) → reviewing/acknowledging the report
→ amending it and confirming the original is byte-for-byte unchanged → importing a batch of
external candidates and accepting one (landing in `domains/clinical`'s allergies table) while
rejecting another → obtaining a SMART access token from `apps/interop-fhir` via client-credentials
and fetching `/fhir/r4/Patient/{id}` and `/fhir/r4/Observation?patient=`/`Encounter?patient=`,
confirming a request without the required scope gets 403, one with it gets a correctly-mapped
FHIR resource or `Bundle`, `/fhir/r4/metadata` is reachable unauthenticated, and a cross-tenant
SMART client fetching another tenant's patient gets 404 — throughout, every write landing in the
expected `audit_events`/`outbox_events` rows. One real bug this walkthrough caught that no
typecheck could: two of the three apps' constructor-injected `Reflector`/service dependencies
resolved to `undefined` at runtime despite an error-free Nest bootstrap (fixed with explicit
`@Inject(...)`) — see `apps/interop-hl7/src/hl7/hl7.controller.ts` and
`apps/interop-fhir/src/common/smart-scope.guard.ts`.

**Phase 5** was verified the same way: migration `0022` applies cleanly on top of Phase 4's, the
full `test`/`test:integration`/`test:tenant-isolation` suite is green across the new
`@ehr/erx-adapter` package and the extended `@ehr/medication` (135/135 Turborepo tasks), and a full
HTTP walkthrough against `apps/api`: an ordinary (non-controlled) prescription creates both the
`prescriptions` row and its linked `medications` entry, with the gateway's receipt id landing on
the record → a controlled-substance payload sent to the *ordinary* route is rejected with a real
422, and a non-controlled payload sent to the `/controlled` route is rejected too → a real
controlled-substance prescription succeeds on the `/controlled` route → a Schedule II prescription
with `refillsAuthorized: 2` is rejected by the DTO's own Zod refine → medication/pharmacy search
and a formulary lookup all return the embedded synthetic gateway data → a refill request → approve
cycle resets `refillsRemaining`, and a second request → deny cycle records the denial reason → a
second cancel on an already-cancelled prescription is a real 409 → a cross-tenant fetch of the
prescription returns 404 — with every one of these actions (including the three read-only `/erx/*`
lookups) landing in `audit_events`, and every state-changing one landing in `outbox_events`, in the
same style as every prior phase's walkthrough.

**Phase 6** was verified the same way: migrations `0023`–`0025` apply cleanly on top of Phase 5's,
the full `test`/`test:integration`/`test:tenant-isolation` suite is green across the new
`@ehr/clearinghouse-adapter`, `@ehr/billing`, `@ehr/claims`, `@ehr/payments`, and
`@ehr/webhook-gateway` (158/158 Turborepo tasks), and a full HTTP walkthrough across `apps/api` +
`apps/webhook-gateway`: capturing a charge lands it in the coding queue, and finalizing its coding
removes it → creating a claim from a deliberately malformed charge and submitting it produces a
real 422 from the scrubber (not a stub) → submitting a clean claim produces ClaimVersion 2 and a
gateway transaction id → an unsigned and a badly-signed webhook are both rejected with a real 401
→ a correctly HMAC-signed 277CA acceptance transitions the claim to `accepted` and posts the
charge to the patient ledger → a second claim's correctly-signed 277CA *rejection* opens a Denial
and a Task, visible in the claim's composed timeline (versions + denials + remittances) →
resolving the denial marks it resolved → a correctly-signed 835 against the accepted claim posts a
Remittance, credits the ledger, and marks the claim `paid` — after which the ledger's entries for
that claim net exactly to zero → an eligibility check persists and returns the gateway's synthetic
result → cross-tenant fetches of the charge, claim, denial, and ledger all return 404 — with every
staff-driven action landing in `audit_events` and every domain write (staff- and webhook-driven
alike) landing in `outbox_events`, confirming the documented scope decision that webhook-driven
writes intentionally have no `audit_events` counterpart. One real gap this walkthrough caught
that no automated test had: the ledger never posted a charge debit at all until this pass added
that step to `apps/webhook-gateway`'s 277CA-acceptance handler — see "Phase 6 scope decisions"
above.

**Phase 7** was verified the same way: migrations `0026`–`0027` apply cleanly on top of Phase 6's,
the full `test`/`test:integration`/`test:tenant-isolation` suite is green across the new
`@ehr/search-adapter` and `@ehr/query` (168/168 Turborepo tasks), and a full HTTP walkthrough
against `apps/api`: creating a patient with an active diabetes diagnosis, saving a cohort using the
spec's own worked-example DSL, and executing it correctly returns that patient (and not an
unrelated one) with a real `EXPLAIN`-derived cost estimate → submitting a DSL with an unknown field
name is rejected with a real 422 before it ever reaches the compiler → each of the three governed
queries (patient count by active problem, encounters by month, claims status breakdown) returns a
real tenant-scoped aggregate, confirmed against live RCM data from earlier phases → a full-tenant
reindex correctly picks up patients, documents, and claims, and a subsequent search finds a
newly-created patient by name → a cross-tenant fetch of a saved cohort returns 404, and a
cross-tenant search for the same term returns nothing (filtered inside the query, not after) —
with every action landing in `audit_events` and `outbox_events` as expected. One gap the
walkthrough surfaced honestly rather than silently: exporting a cohort execution's CSV to object
storage failed with `ECONNREFUSED` against MinIO, because this whole project has never had a
running Docker/MinIO instance in the environment it was built in (the same pre-existing constraint
`README`'s own "Docker Desktop's backend would not start" note already describes for every prior
phase) — the export *logic* itself (`CohortService.exportExecution`) is still fully verified by the
automated test suite against a fake gateway; only the generic, already-existing S3 connectivity
path remains untested end-to-end in this environment.

**Phase 8** was verified the same way: migrations `0028`–`0031` apply cleanly on top of Phase 7's,
the full `test`/`test:integration`/`test:tenant-isolation` suite is green across the new
`@ehr/payment-adapter`, `@ehr/notification-adapter`, `@ehr/consent`, `@ehr/messaging`, and
`@ehr/portal` (191/191 Turborepo tasks, including 8 new tenant-isolation specs), and a full HTTP
walkthrough against `apps/api`: registering a portal account against a real patient with the wrong
date of birth is rejected, the correct date of birth succeeds and returns a portal-audience token
pair → a staff-audience token presented on a portal route and a portal-audience token presented on
a staff route are both correctly rejected (403, "no authenticated \[...\] actor") → a portal
account with no grant reading a patient's chart gets a real 404, not a leak → staff creates a proxy
grant for a second ("guardian") portal account, which immediately gains read access to the same
empty-but-real appointments/results/notes/problems chart → staff revokes the grant and the
guardian's access drops back to 404 → a cross-tenant staff token cannot read the patient at all →
a portal-authored message thread is visible to staff, a staff reply is visible on the portal side,
and the reply fires a real `NotificationGateway.sendEmail()` call to every active grant holder
(confirmed in server logs) → a portal payment posts a real `patient_payment` ledger entry and moves
the balance, and a failed payment posts none → a portal profile read/update round-trips correctly
→ a portal session is listed and revoked, and revoking another account's session by id correctly
404s → login/refresh/logout all work, refresh correctly rotates the token (old refresh token
becomes unusable) → every one of these actions lands in `audit_events` with `actor_type: 'patient'`
and the matching `outbox_events` rows (`proxy_grant.created.v1`/`.revoked.v1`,
`message_thread.created.v1`, `message.posted.v1`). One gap the walkthrough surfaced the same
honest way Phase 7's did: `POST /portal/patients/{id}/export-requests` calls
`ObjectStorageGateway.putObject()`, a genuine server-side write, and failed with `ECONNREFUSED`
against MinIO in this Docker-free environment — the export logic itself (bundle assembly, the
`ConsentService.assertAccess()` gate, scoping the download link to the requesting portal account)
is fully verified by the tenant-isolation suite against a fake gateway; only the generic S3
connectivity path — already untested end-to-end since Phase 4 — remains unverified live. A second,
genuinely new bug this pass's manual walkthrough caught that no automated test had: `apps/api`'s
`tsx watch` dev-mode transform silently failed to inject `PortalAuthController`'s constructor
parameter (a `TypeError: Cannot read properties of undefined` at request time, not a bootstrap
error) because it was the first `apps/api`-local controller with a single, purely type-inferred
constructor dependency — see "Phase 8 scope decisions" above for the fix.

**Phase 9** was verified the same way: migration `0032` applies cleanly on top of Phase 8's, the
full `test`/`test:integration`/`test:tenant-isolation` suite is green across the new
`@ehr/ai-adapter` and `@ehr/ai` (200/200 Turborepo tasks, including a tenant-isolation spec that
exercises the full NL-to-cohort-DSL execute path — an invalid candidate rejected before
`CohortService.execute()` ever runs, a valid one producing a real `cohort_executions` row — against
a live Postgres, not a mock), and a full HTTP walkthrough against `apps/api`: proposing an ambient
note draft for a real encounter → its persisted provenance object matches spec §15.4's exact shape
field-for-field → accepting it with edits sets `status: accepted_with_edits` and records the
reviewer, and a database check confirms zero `Note` rows were created by that accept → a second
resolve attempt on the same generation is a real 409, not a silent no-op → asking a chart-Q&A
question against a patient with no chart data yet returns a real 422 (the zero-context guard) →
adding a real Problem and asking again succeeds, citing that exact `Problem/{id}` as its only
source ref → rejecting it leaves the chart provably unchanged → coding suggestions grounded on the
same problem are proposed and accepted with zero `Charge` rows created → task summarization
correctly 422s with no open tasks and succeeds once one exists → the NL-to-cohort-DSL flow runs
end to end: propose a candidate → attempt to execute a deliberately invalid edited DSL and get a
real 422 with the underlying Zod issues, no `cohort_executions` row created → execute the original
valid candidate and get back a real, live-compiled `cohort_executions` row, with the generation
correctly resolved to `accepted` and linked to it → a second execute attempt on the same
(now-resolved) generation is a real 409 → denial summarization and patient-message drafting both
ground correctly on real `Denial`/`Claim` and `Message` rows from earlier phases' data → throughout,
a cross-tenant token gets a real 404 (never a 403, never a leak) reading, accepting, rejecting, or
executing another tenant's generation → every propose/accept/reject/execute call lands in
`audit_events` with `actor_type: 'user'`, and the matching `outbox_events` rows
(`ai_generation.proposed.v1`/`.accepted.v1`/`.rejected.v1`, plus the pre-existing
`cohort.executed.v1` from the reused, unmodified `CohortService.execute()`) appear alongside them.
No new bugs surfaced this pass beyond confirming the `@Inject()` DI pattern from Phase 8's fix
continues to be unnecessary for `domains/ai`'s controllers (all `tsc`-compiled domain-package code,
not `apps/api`'s `tsx`-transformed dev build).

**Phase 10** was verified differently from every prior phase, deliberately: there's no new domain
or migration to apply, so verification is the new golden-path E2E suite plus a genuinely-executed
operational drill rather than a manual HTTP walkthrough. `pnpm turbo run lint typecheck test
test:integration test:tenant-isolation` stayed green across the whole repo (200/200 Turborepo
tasks) with the new `apps/api/src/e2e/golden-path.integration.test.ts` passing 7/7 fresh (not
cached) alongside it — no other package's code changed this phase besides the small set of docs and
one new test file. Concretely, that suite proved live against the dev Postgres: merging a duplicate
patient reassigns identifiers and marks the source `merged`, reversing the merge restores it to
`active`, and a self-merge plus a double-reversal both correctly throw `ConflictError` rather than
silently no-op-ing → signing a note and then attempting to edit its content directly is rejected
with a real `ConflictError`, and `amend()` leaves the original's content byte-for-byte unchanged
while the amendment correctly references it → amending a diagnostic report never mutates the
original row, only adds a new linked one → a `criticalFlag: true` diagnostic report genuinely opens
an `open`, `urgent`, `critical_result_review` `Task` — not just a flag on the report, an actual
queryable Task row → an AI generation proposed with zero grounding context is refused with a real
`ValidationError`, one grounded on a real `Problem` row correctly cites it, accepting it changes
nothing in the patient's problem list, and a second resolve attempt is a real `ConflictError` → and
Tenant B gets a real `NotFoundError` (never a 403, never a leak) reading Tenant A's encounter, note,
diagnostic report, or patient by their real ids, confirmed across the full multi-domain object graph
this suite built, not just single-resource-type checks. Separately and manually, the backup/restore
drill described above was actually executed once against the dev Postgres (not simulated, not
merely documented) with a real, logged pass — see `docs/runbooks/backup-restore.md`. The security
self-assessment's `pnpm audit` run is likewise real, current output, not a placeholder — see
`docs/security/pre-pilot-self-assessment.md`. `docs/pilot-readiness-checklist.md` was cross-checked
line by line against `EHR_REGULATORY_MANUAL.md` §29 to confirm every listed item is present and
honestly marked. Dev Postgres and the API dev server were both shut down cleanly at the end of this
pass, the same as every prior phase.
