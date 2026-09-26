# infra/policies

Not implemented in Phase 1 — see `EHR_BUILD_SPEC.md` §26.

Reserved for IAM/SCP/OPA-style policy-as-code once there is real cloud infrastructure to govern
(see [ADR-0001](../../docs/adr/0001-railway-hosting.md) — that's post-Phase-0/AWS-migration).
The application-level authorization policy engine (tenant/role/permission checks) lives in
`packages/authz`, not here — this folder is for infrastructure/platform policy, a distinct
concern.
