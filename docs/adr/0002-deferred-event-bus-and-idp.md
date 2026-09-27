# ADR-0002: Defer external event bus and external identity provider

## Status

Accepted — 2026-09-25

**Update (2026-09-27):** MFA (TOTP) is now real, closing the gap described in the "MFA is
structurally present but not functionally implemented" bullet below — see `packages/auth-adapter`'s
`startMfaEnrollment`/`confirmMfaEnrollment`/`verifyMfaChallenge` and `apps/api`'s `auth.controller.ts`.
External identity federation (SSO/SAML/OIDC) remains exactly as described below: not implemented.

## Context

`EHR_BUILD_SPEC.md` §2.1 specifies two external vendor dependencies that Phase 1 as scoped does
not actually need yet:

1. **Event bus** — "AWS MSK/Kafka-compatible managed bus" for "domain events and integration
   fan-out." Looking at the spec's own build order (§26), durable fan-out to downstream
   consumers (search indexing, analytics CDC, interop adapters) is a **Phase 4/7** concern.
   Phase 1's actual requirement (rule #12: *"Use the transactional outbox pattern for domain
   events. Never rely on `DB commit -> publish event` as two unrelated operations"*) does not
   itself require a durable multi-consumer bus — it requires that publishing be transactionally
   coupled to the write, which an outbox table plus a relay satisfies regardless of what sits on
   the other side of "publish."

2. **External identity provider** — "Auth0/Okta customer identity or AWS Cognito **only after
   BAA/requirements review**" (spec §2.1, emphasis in original). That BAA/requirements review is
   Phase 0 work (see ADR-0001 and `EHR_REGULATORY_MANUAL.md` §3.1/§4.1) that has not happened.

Building either integration now would mean standing up and paying for vendor infrastructure
before there's a real requirement driving its shape (how many consumers, what auth claims a
real IdP needs to carry, etc.), and — for the IdP specifically — before the compliance
prerequisite the spec itself names is satisfied.

## Decision

**Event bus:** Implement the outbox pattern entirely in Postgres for Phase 1:

- Domain writes insert their row and a corresponding `outbox_events` row in the same
  transaction (`packages/db`'s `withTenantContext`).
- `apps/worker` runs an `OutboxRelay` polling loop that reads `pending` rows and dispatches them
  to an in-process `DomainEventBus` (a typed `EventEmitter` wrapper), then marks them
  `published`.
- Both the relay and the bus sit behind an `EventPublisher` interface in `packages/outbox`.
  When Phase 4/7 needs real multi-consumer fan-out (search indexing, analytics CDC, interop),
  only this interface's implementation changes — no domain code that publishes events needs to
  change.

**Identity provider:** Implement a first-party `IdentityProvider` in `packages/auth-adapter`
(email/password via `argon2id`, JWT/JWKS via `jose`) rather than integrating Auth0/Okta/Cognito
now:

- All token verification (the `AuthzGuard`, any future resource server) validates against a
  JWKS endpoint (`/.well-known/jwks.json`) only — never against provider-specific claims —
  so a real OIDC/SAML provider can be swapped in later without touching verification call
  sites, satisfying the same adapter-boundary philosophy the spec applies elsewhere (§29,
  "Vendor abstraction boundaries").
- MFA is **structurally present but not functionally implemented**: `IdentityProvider` declares
  `verifyMfaChallenge()`, and `apps/api` exposes `POST /api/v1/auth/mfa/challenge` returning
  `501 Not Implemented` (present in the OpenAPI contract, not silently missing). This is a
  deliberate choice to avoid the far worse failure mode of an internally improvised MFA flow
  that *looks* enforced but isn't — `EHR_REGULATORY_MANUAL.md` §6 lists MFA as a required
  workforce control before PHI access, and §29's pre-pilot gate explicitly checks "MFA
  enforced." Real MFA enforcement is therefore a pilot go-live gate, not a Phase 1 skeleton
  deliverable, and the code makes that gap visible rather than papering over it.

## Consequences

- No Kafka/MSK, OpenSearch, or ClickHouse exists yet. Nothing in Phase 1 (tenant/workforce
  CRUD, audit, document upload) needs search or analytics freshness, so this has no functional
  cost right now.
- Domain event delivery is at-least-once within a single process (the outbox relay), not
  durable across a process crash between "dispatch" and "mark published" unless the relay is
  written to be idempotent-safe on restart (it must re-scan `pending` rows, not track an
  in-memory cursor) — this is a real limitation to keep in mind but is acceptable for Phase 1's
  scope (no external consumers exist yet to receive a duplicate or a gap).
- Login is real (argon2id + JWT), but **MFA is not enforced** and **there is no real identity
  federation**. This repository must not be used with real patient data or real workforce
  credentials for anything beyond development until: (a) MFA is actually implemented and
  enforced, and (b) the Phase 0 BAA/requirements review for an external IdP is complete or a
  documented equivalent risk-acceptance is signed off, per `EHR_REGULATORY_MANUAL.md` §29's
  "MFA enforced" pre-pilot checklist item.
- When Auth0/Okta/Cognito is eventually integrated, expect to add a second
  `IdentityProvider` implementation and a migration path for existing `users`/password
  rows (e.g., forced reset or federated-identity linking) — not addressed here since it is
  out of scope until the provider is chosen.

## Alternatives considered

- **Stand up Kafka/MSK now "to do it right the first time."** Rejected: no consumer exists yet
  to justify the operational cost, and the spec's own build order treats this as later-phase.
- **Skip login entirely / use a hardcoded dev token.** Rejected: Phase 1's exit gate requires
  real tenant-isolation and authorization tests (spec §18.2), which need a real (if simplified)
  authentication path to exercise meaningfully — a hardcoded token would test nothing.
- **Integrate Auth0 in a free/dev tier now.** Rejected for this pass because it adds a vendor
  dependency before Phase 0's BAA/requirements review, contrary to the spec's explicit
  sequencing in §2.1; revisit once that review happens.
