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
