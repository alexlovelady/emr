# ADR-0001: Railway instead of AWS for Phase 1 hosting

## Status

Accepted — 2026-09-25

## Context

`EHR_BUILD_SPEC.md` §2.1/§2.2 mandates AWS (ECS/Fargate, RDS-class Postgres, MSK, OpenSearch,
ClickHouse, S3, Terraform-managed AWS Organizations) as the fixed hosting stack, justified by
the need for a signed AWS BAA before any Protected Health Information (PHI) touches the
infrastructure.

`EHR_REGULATORY_MANUAL.md` §26 ("Founder priority order") and §29 (pre-pilot go/no-go gate)
make clear that a signed BAA, HIPAA risk analysis, and AWS account structure are **Phase 0**
prerequisites that happen before serious clinical coding — not something this pass can or
should do. This repository currently contains no real PHI and none is planned until a real
pilot customer, signed BAA, and completed risk analysis exist. Everything in Phase 1 operates
on synthetic fixtures only (spec §22: "local"/"dev"/"test" environments are explicitly "No
[real PHI]").

Standing up full AWS Organizations, Terraform, ECS/Fargate, MSK, OpenSearch, and ClickHouse
before there is a product, a customer, or PHI to protect would front-load significant
operational complexity for no present benefit, and contradicts the spec's own stated
philosophy (§2.1, "Why ECS before Kubernetes": *"A regulated product needs reliable operations
more than cluster sophistication... Move to EKS only when workload or customer requirements
justify it"*) — the same reasoning applies a fortiori to standing up all of AWS before there is
a workload at all.

## Decision

For Phase 1 (and until Phase 0's compliance/BAA work is complete and a real pilot requires
production PHI), host on **Railway** instead of AWS for everything Railway can reasonably run:

- **Postgres** — Railway's managed Postgres plugin, in place of RDS/Aurora.
- **Redis/Valkey** — Railway's managed Redis plugin.
- **Backend (`apps/api`, `apps/worker`)** — Railway service deployments (Docker-based, see
  `docs/deploy/railway.md`), in place of ECS/Fargate.
- **Frontend (`apps/admin-web` and later web apps)** — Railway service deployments, in place of
  CloudFront/ALB-fronted ECS.

**Not replaced by Railway** (deferred entirely, not moved to an alternative vendor, since they
are genuinely later-phase concerns per the spec's own build order in §26):

- **Object storage** — Railway has no native durable, multi-instance object storage product
  (its volumes are per-service local disk). Documents are built against a generic
  S3-compatible interface (`packages/object-storage`), backed by **MinIO** locally and
  **Cloudflare R2** for any Railway-hosted environment. R2 requires no AWS account, no BAA
  gate (synthetic data only), and is API-compatible with S3, so the same client code points at
  real AWS S3 later by changing only endpoint/credentials — no code change. This choice is
  scoped to this ADR rather than split into a separate one because it exists for the same
  reason (Railway has no equivalent) and resolves the same way (defer real AWS, build behind
  an interface).
- **Event bus (Kafka/MSK), search (OpenSearch), analytics (ClickHouse)** — genuinely Phase
  4/7 requirements per spec §26, not needed for a Phase 1 platform-foundation skeleton at all.
  See ADR-0002 for how Phase 1's outbox/event-publishing need is met without them.
- **IaC (Terraform)** — `infra/terraform/` is left as a documented placeholder. Railway does
  not need Terraform for this scale of deployment; AWS Terraform returns once Phase 0's
  account structure work (spec §2.2) actually happens.

## Consequences

- No real AWS account, BAA, or Terraform-managed infrastructure exists yet. This is
  intentional and matches the current compliance state (no PHI, no BAA, no pilot customer) —
  it is not a shortcut being taken against the spec's HIPAA posture. **This ADR is only valid
  while the "no real PHI" ceiling from `EHR_REGULATORY_MANUAL.md` §22/§29 holds.**
  Before any real patient data enters the system, a follow-up ADR must revisit AWS
  migration, an executed AWS BAA, and Terraform-managed infrastructure per spec §2.1/§2.2 and
  regulatory manual §7/§29 — this is a hard gate, not a "someday."
- Deployable services need a Dockerfile per app (Railway's Nixpacks auto-detection is
  unreliable for a pnpm+Turborepo monorepo with multiple deployables) — see the
  `turbo prune --docker` pattern used in each app's `Dockerfile`.
- Because Railway's provisioned Postgres user is effectively the database owner, and Postgres
  Row-Level Security does not apply to table owners, the application must connect as a
  separate, deliberately less-privileged role (`ehr_app`) rather than the provisioned owner
  role. See `packages/db` migration `0001_extensions_and_app_role.ts` and its inline
  commentary for the mechanics and the manual fallback if the provisioned Railway user lacks
  `CREATEROLE`.
- CI's `docker-build` job (see `.github/workflows/ci.yml`) builds and scans these images now,
  but no automated `deploy` job exists yet — deploys are manual (`docs/deploy/railway.md`)
  until this pass's scope expands.

## Alternatives considered

- **Full AWS from day one, as the spec's literal text requires.** Rejected for this pass only
  because Phase 0 (BAA, account structure, legal/compliance engagement) has not happened and
  there is no PHI to protect yet — not because the spec's reasoning for AWS is wrong. AWS
  remains the target for any real pilot.
- **Fly.io / Render** as Railway alternatives. Not evaluated in depth; Railway was the
  explicit instruction. Nothing in this ADR is Railway-specific enough to block reconsidering
  this later — the adapter boundaries (`packages/object-storage`, `packages/auth-adapter`, the
  `EventPublisher` interface in `packages/outbox`) are what actually protect against lock-in,
  not the specific PaaS chosen.
