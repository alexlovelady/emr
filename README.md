# EHR Platform — Phase 1 + 2 + 3 + 4 (Platform Foundation; Patient/Scheduling/Intake; Clinical Chart; Orders/Results + Interop)

Cloud-native ambulatory EHR + practice-management + revenue-cycle platform. This repository
currently implements **Phases 1–4** of `EHR_BUILD_SPEC.md`'s build order (§26). Phase 1: the
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
implementation (see "Phase 4 scope decisions" below). Later phases (eRx, RCM, AI, etc.) are not
built yet — see the `README.md` in each reserved-but-empty folder for where it lands.

Read `EHR_BUILD_SPEC.md` and `EHR_REGULATORY_MANUAL.md` first — this README assumes their
context. Three deliberate deviations from the spec's literal text are documented in
[`docs/adr/0001-railway-hosting.md`](docs/adr/0001-railway-hosting.md) and
[`docs/adr/0002-deferred-event-bus-and-idp.md`](docs/adr/0002-deferred-event-bus-and-idp.md):
Railway instead of AWS (no PHI exists yet, Phase 0 compliance work hasn't happened), a
first-party JWT auth adapter instead of Auth0/Okta, and a Postgres-outbox instead of a managed
event bus — both swappable later behind the interfaces already in place.

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
- **MFA and real identity federation are structural stubs, not implemented.** Do not point this
  at real workforce credentials or real patient data — see ADR-0002 and
  `EHR_REGULATORY_MANUAL.md` §29's pre-pilot gate.
- **Patient identity never uses an external identifier as the primary key** (spec §5.3) — `patients.id`
  is the only stable key; MRNs and other external identifiers live in `patient_identifiers`,
  scoped to the issuing organization. Duplicate detection (`GET /api/v1/patients/duplicates`) is
  deterministic scoring only and never merges anything automatically — `POST
  /api/v1/patients/{id}/merge` is an explicit human action, and it's reversible via `POST
  /api/v1/patients/merges/{mergeId}/reverse` (`domains/patient`).
- **The appointment status column is an explicit state machine**
  (`domains/scheduling/src/appointment/appointment.service.ts`), not a free-text field — only the
  states before an Encounter exists (Scheduled/Confirmed/CheckedIn, plus Cancelled/NoShow) are
  implemented in Phase 2. Phase 3's `domains/clinical/src/encounter/encounter.service.ts`
  continues the same golden path (spec §11.1): an Encounter can only be created from a
  `checked_in` appointment, and its own state machine runs Roomed → InProgress → Documentation →
  Signed → CodingReview — the RCM states after that (ClaimReady, Submitted, ...) are Phase 6.
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
- **HL7 v2 support is real but narrow**: `packages/hl7` parses only `ORU^R01` (result) messages;
  ADT/SIU/ORM/MDM are explicitly deferred per the spec's own "as needed" license. `apps/interop-hl7`
  exposes an authenticated HTTP endpoint (not a real MLLP listener — documented simplification)
  that always stores the raw message first, is idempotent on `(tenant_id, message_control_id)`
  redelivery, and NACKs without crashing when an order can't be correlated.
- **C-CDA reconciliation accepts pre-structured JSON**, not real C-CDA XML — the actual product
  requirement (spec §11.3's accept/reject/mark-duplicate/replace workflow) is fully real in
  `domains/clinical`'s `external-candidate` sub-module; only the XML-parsing front door is deferred.
- **FHIR R4 is a thin read-only Lane A facade** (`apps/interop-fhir`): `/fhir/r4/metadata`,
  `Patient/{id}`, `Observation?patient=&category=`, `Encounter?patient=` only —
  `$everything`/bulk `$export` need a job queue this repo doesn't have yet and are a documented
  gap, not a silent one.
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
