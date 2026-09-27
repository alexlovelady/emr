# ADR-0005: Golden-path E2E testing style and backup/restore drill mechanism

## Status

Accepted — 2026-09-26

## Context

Phase 10 ("pilot readiness," `EHR_BUILD_SPEC.md` §26) needed two new pieces of testing/operational
infrastructure that no prior phase built: an end-to-end test suite spanning multiple domains in one
realistic patient journey, and an actually-executed backup/restore drill
(`EHR_REGULATORY_MANUAL.md` §21.1/§25/§29: "Test actual restores; a green backup dashboard is not
evidence that restoration works"). Two technical decisions needed making before either could be
built.

**E2E testing style.** `supertest` has been an installed `apps/api` devDependency since Phase 1 but
is used nowhere in the repo; no `@nestjs/testing`/`Test.createTestingModule` usage exists either.
The established integration-test convention across 6 existing `*.integration.test.ts` files (e.g.
`apps/interop-hl7/src/hl7/hl7.service.integration.test.ts`) is direct, in-process calls to real
domain services against a shared Kysely handle from `@ehr/testing`'s `setupTestDb()` — no HTTP
layer, no Nest application bootstrap.

**Backup/restore mechanism.** The `embedded-postgres` npm package used for Docker-free local
development (see the main README's "Verification status" section) bundles `postgres.exe`,
`pg_ctl.exe`, and `initdb.exe`, but not `pg_dump`, `pg_restore`, or `psql` — the standard tools a
logical SQL-dump-based backup/restore drill would use, and the tools production (Railway-hosted
Postgres, ADR-0001) or a real Postgres install would have.

## Decision

**E2E suite**: `apps/api/src/e2e/golden-path.integration.test.ts` follows the existing direct
in-process pattern exactly — no HTTP layer, no Nest bootstrap, `supertest` still unused. It is
picked up automatically by the pre-existing `apps/api/vitest.integration.config.ts` glob
(`**/*.integration.test.ts`); no new Turbo task or config was needed.

**Backup/restore drill**: use a *physical* backup (stop the server, copy its data directory, restart
it) rather than a logical dump, and prove restorability by copying that backup to a fresh location
and starting a second, independent `embedded-postgres` instance against it on a different port
(5433) to verify the data. See `docs/runbooks/backup-restore.md` for the exact commands and the
real, executed result.

## Consequences

- The E2E suite cannot exercise HTTP-level concerns (auth header parsing, the `AuthzInterceptor`/
  `AuditInterceptor` chain, route-level `@RequirePermission`/`@Audited` wiring, real request/response
  serialization) — it proves domain-service-level correctness, the same scope every other
  integration test in this repo already has. HTTP-level behavior for these same features is already
  covered by this session's own manual smoke-test walkthroughs each phase (see README's per-phase
  verification paragraphs), just not as an automated, repeatable test.
- If a future phase genuinely needs HTTP-level E2E assertions (e.g. testing the interceptor chain
  itself, not just the services behind it), introducing `@nestjs/testing` + Fastify's `.inject()`
  (not `supertest`, which talks real HTTP and would need a bound port) is the natural next step —
  not attempted here since nothing this phase needed required it.
- The backup/restore drill validates the *property* (a backup restores with data intact) using
  dev-environment tooling that will not be the actual production mechanism. Before pilot, the real
  production restore mechanism (whatever the final hosting provider offers) must be drilled
  separately — this ADR's drill does not substitute for that.

## Alternatives considered

- **Add `@nestjs/testing` + `supertest` now**, finally using the already-installed dependency.
  Rejected: no existing integration test in the repo needs HTTP-level assertions, and introducing a
  second testing style for one new file adds inconsistency without a concrete requirement driving it.
- **Install a full Postgres distribution with `pg_dump`/`pg_restore` just for this drill.** Rejected:
  would diverge from every other phase's zero-additional-tooling embedded-Postgres setup for a
  one-time drill; the physical-copy approach validates the same underlying property using what's
  already present.
