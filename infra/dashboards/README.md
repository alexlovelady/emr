# infra/dashboards

Not implemented in Phase 1 — see `EHR_BUILD_SPEC.md` §19/§26.

Reserved for the operational dashboards (workflow-health telemetry: unsigned notes by age,
claim submission failures, outbox backlog, etc.) once later phases add the domains those
metrics depend on. `packages/observability` defines the Phase-1-scoped metric counters that
exist today; there's nothing to dashboard yet beyond what a raw metrics backend already shows.
