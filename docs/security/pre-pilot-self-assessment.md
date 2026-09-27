# Pre-pilot security self-assessment

`EHR_REGULATORY_MANUAL.md` §21.1 lists 11 items required "before pilot." This is an **internal
engineering self-assessment**, not the independent security assessment or penetration test the
regulatory manual actually requires — several items below cannot be satisfied by this kind of
review at all, and are marked accordingly. Nothing in this document should be read as satisfying
`EHR_REGULATORY_MANUAL.md` §29's "Independent penetration test complete" checklist item.

| # | §21.1 item | Status | Evidence / notes |
|---|---|---|---|
| 1 | HIPAA risk analysis | **NOT DONE** | Requires a formal risk-analysis process against a real deployment with real data flows and a real BAA/vendor set — none exist yet. Must be performed by, or with, qualified privacy/security counsel before any real PHI is processed. |
| 2 | Independent penetration test | **NOT DONE** | Requires a licensed, independent third-party firm. This self-assessment is not a substitute and does not claim to be one. |
| 3 | Cloud architecture review | **PARTIAL** | Current hosting (Railway, per `docs/adr/0001-railway-hosting.md`) is a pre-AWS-migration placeholder explicitly documented as such — a real cloud architecture review is only meaningful once the target production architecture (AWS, per the spec) is actually built. |
| 4 | Tenant-isolation review | **DONE** | Real, automated, and independently re-verified every phase: Row-Level Security (`packages/db`'s `enableTenantIsolation`) backs all 20 tenant-scoped tables, exercised by 19 `domains/*/test/tenant-isolation.spec.ts` files plus this phase's golden-path E2E suite's cross-tenant checks — all green under `pnpm turbo run test:tenant-isolation`. This is the single strongest, most evidence-backed item in this table. |
| 5 | Dependency/SBOM process | **PARTIAL — real findings below** | No formal SBOM tool is wired in yet, but `pnpm audit` was run for real against the current lockfile as part of this assessment (see below) — a genuine, current vulnerability snapshot, not a placeholder. |
| 6 | Vulnerability management SLA | **NOT DONE** | No triage/remediation SLA exists; see the `pnpm audit` findings below as the first real backlog it would need to cover. |
| 7 | Backup restore test | **DONE** | Actually executed, not just documented — see `docs/runbooks/backup-restore.md`'s "Last tested" section (2026-09-26): a canary row and full table counts were verified present in an independently-restored Postgres instance. |
| 8 | Incident-response tabletop | **NOT DONE** | Requires a real team to run a tabletop exercise against; none exists yet. |
| 9 | Access review | **PARTIAL** | The authorization model itself is real and tested (`packages/authz`'s 8-layer `PolicyEngine`, `policy-engine.test.ts`, layered tests) — but a genuine *access review* means auditing who actually holds which roles in a real deployment, which doesn't exist yet (only synthetic dev fixtures do). |
| 10 | Secrets/key rotation procedures | **NOT DONE** | JWT signing keys are currently generated/loaded once to local disk in dev (`packages/auth-adapter`'s `loadOrCreateKeyMaterial`) with no rotation procedure at all. Must be designed against real secrets-management infrastructure (e.g. a cloud KMS/secrets manager) before pilot. |
| 11 | Secure SDLC policy | **PARTIAL** | Real practices already in force: Zod validation at every external boundary (spec §2.1's own rule), Row-Level Security as a structural (not just app-logic) tenant boundary, a documented ADR trail for every deliberate architectural deviation, and this session's own iterative build→typecheck→lint→test→live-verify discipline across all 10 phases. Missing: no CI pipeline actually wired up outside this interactive session, no formal SAST/DAST tooling, no written secure-coding standard document separate from what's implicit in the codebase itself. |

## Dependency vulnerability snapshot (`pnpm audit`, run 2026-09-26)

**32 findings: 2 critical, 16 high, 13 moderate, 1 low.** Full real output is reproducible via
`pnpm audit` against the current `pnpm-lock.yaml`. Notable findings, triaged by actual relevance to
this codebase (not just severity number):

- **`kysely` (current: 0.27.6) — two high-severity SQL-injection advisories** (`sql.lit()` backslash
  escaping; `JSONPathBuilder.key()`/`.at()` path-metacharacter injection), fixed in 0.28.12+/0.28.17+.
  **Checked**: neither `sql.lit()` nor `JSONPathBuilder` is used anywhere in this codebase (a
  repo-wide grep confirms it) — the vulnerable code paths are not currently reachable. Still a real,
  actionable dependency-upgrade item since `kysely` is this system's core data-access layer; low
  urgency today given non-reachability, but should not be left indefinitely.
- **`@fastify/middie` — two critical/high middleware-bypass advisories**. This repo does not
  register any Fastify middleware via `@fastify/middie` (no `apps/*/src/main.ts` uses it) — it is a
  transitive dependency of `@nestjs/platform-fastify`, not directly exercised.
- **`vitest`/`@vitest/mocker`/`vite` — critical/high/moderate advisories**, all dev-only tooling
  (test runner, dev server) never present in a production deployment — real to fix for developer
  workstation hygiene, not a production attack surface.
- **`@opentelemetry/*` — several high/moderate DoS-via-malformed-request advisories** in the
  Prometheus exporter and Jaeger propagator (`packages/observability`). These *do* run in the actual
  server process. Should be upgraded before any real external exposure of metrics/tracing endpoints.
- **`fastify` itself — moderate/low findings** (content-type/header spoofing, schema-coercion
  bypass, unbounded memory in `sendWebStream`) — directly relevant, since `apps/api` and every other
  `apps/*` service runs on Fastify. Worth a real upgrade pass before pilot, independent of this
  assessment's scope.

**Recommendation**: before pilot, run a real dependency-upgrade pass prioritized by production
reachability (fastify/`@nestjs/platform-fastify`/`@opentelemetry/*` first, `kysely` next, `vitest`/
`vite` last since they're dev-only) — not attempted in this pass, since it risks introducing
unrelated breakage this session did not scope time to re-verify across all 10 phases.

## What this assessment is, and is not

This is a real, current snapshot of what security-relevant work has and hasn't happened, produced
by the same engineering process that built the system. It is **not** a substitute for items 1, 2, 6,
8, or 10 above, all of which require independent, qualified, or real-infrastructure-backed review
that an internal self-assessment structurally cannot provide.
