# EHR Platform — Phase 1 (Platform Foundation)

Cloud-native ambulatory EHR + practice-management + revenue-cycle platform. This repository
currently implements **Phase 1** of `EHR_BUILD_SPEC.md`'s build order (§26): the monorepo
skeleton, tenant/workforce identity, the layered authorization model, audit + transactional
outbox, a first-party auth adapter, a thin documents flow, and the platform's testing/CI/CD/
observability scaffolding. Later phases (clinical chart, orders/results, RCM, AI, etc.) are not
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
                documents (thin upload/download flow)
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

Currently verified live, end to end, against a real Postgres: all 7 migrations, seeding, the
full `test`/`test:integration`/`test:tenant-isolation` suite (73/73 Turborepo tasks) with Row-Level
Security genuinely exercised (not just each repository's own `where tenant_id = ...` filter), and
a full HTTP walkthrough — login, organization/location creation, listing, a cross-tenant read
correctly returning 404 (never leaking that the row exists under another tenant), an
unauthenticated request returning 403, every action landing in `audit_events` with the correct
actor/outcome, every domain write landing in `outbox_events`, and `apps/worker` relaying all of
them to `published`.
