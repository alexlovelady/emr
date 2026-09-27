# ai

Phase 9 (EHR_BUILD_SPEC.md §15 / §26): all 8 allowed AI features, sharing one propose->review
workflow (`generation/`) backed by `@ehr/ai-adapter`'s `AiGateway`. No LLM vendor BAA exists yet
(regulatory manual §16.1) — every generation currently comes from `NoopAiGateway`, a deterministic
stub; see `docs/adr/0004-deferred-ai-vendor.md`.

`AiGenerationService.accept()` never mutates any other domain's data for 7 of the 8 features — a
human takes the accepted (possibly edited) text and uses the existing, already-audited domain-write
endpoint themselves. The one deliberate exception is `nl-to-cohort-dsl`, where "accept" and
"execute" are the same action per spec §8.4, and executing an already-permission-gated, read-only
population query (via `@ehr/query`'s existing, unmodified `CohortDslSchema`/`CohortService`) is
categorically safer than mutating clinical/financial state.

Every proposal requires at least one grounding `context` item — `AiGenerationService.propose()`
throws otherwise — making ungrounded ("unsourced clinical facts," spec §15.3) output structurally
impossible.
