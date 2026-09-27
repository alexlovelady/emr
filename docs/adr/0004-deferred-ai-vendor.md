# ADR-0004: Defer real AI/LLM vendor integration

## Status

Accepted — 2026-09-26

## Context

`EHR_BUILD_SPEC.md` §15.1 requires "one internal AI gateway" fronting every AI feature, responsible
for (among other things) an approved model/vendor list and BAA/PHI eligibility enforcement.
`EHR_REGULATORY_MANUAL.md` §16.1 is explicit: "Consumer chatbot/API terms that permit provider
training on PHI or lack a BAA are not acceptable for production PHI," and requires, before any PHI
use, a signed BAA plus review of training/data-use terms, retention policy, human-review
expectations, region/data residency, subprocessors, security review, model change policy, and a
deletion/termination process. None of that vendor relationship exists in this environment — there
is no LLM provider API key, no BAA, and no §16.2 model/vendor governance record. Building against a
real hosted LLM now would mean sending data through a vendor relationship this project has not
actually vetted, which is exactly the failure mode §16.1 exists to prevent — the same category of
prerequisite ADR-0002 already named for an external identity provider ("Auth0/Okta... only after
BAA/requirements review").

## Decision

Implement a real `AiGateway` interface (`packages/ai-adapter`) covering every §15.1 responsibility
as a genuine, checkable contract — prompt-template versioning, minimum-necessary context assembly,
a redaction hook, model/version capture, a real per-tenant rate cap, and an `isApprovedForPhi()`
gate — backed by exactly one implementation, `NoopAiGateway`, a deterministic stub that performs no
network call and returns templated, reproducible text. `isApprovedForPhi()` returns `false`
unconditionally: this is the honest statement that no PHI may flow through this gateway in its
current form, not a placeholder that happens to return `true`.

All 8 of spec §15.2's allowed features (ambient note draft, encounter summary, chart Q&A grounded
in retrieved chart evidence, patient-message drafting, coding suggestions, denial explanation
summarization, task summarization, NL-to-cohort-DSL) are built as fully real propose→human-review
flows on top of this gateway (`domains/ai`) — one shared `ai_generations` table and
`AiGenerationService` (adapted from Phase 4's `ExternalCandidateService`), with every generation
requiring at least one grounding context reference (spec §15.3's "no unsourced clinical facts,"
enforced structurally, not just by policy) and persisting the exact §15.4 provenance object.
Accepting a generation never itself mutates another domain's data for 7 of the 8 features — a human
takes the (possibly edited) output and uses the existing, already-audited domain-write endpoint
themselves — the one exception being NL-to-cohort-DSL, which reuses `@ehr/query`'s existing,
unmodified `CohortDslSchema` validator and `CohortService.execute()` compiler exactly as spec §8.4
describes ("LLM produces candidate DSL → deterministic validator → ... → execute → return result");
executing an already-permission-gated, read-only, capped population query is categorically
different from mutating clinical or financial state.

## Consequences

- No real drafting, summarization, or Q&A *quality* exists — `NoopAiGateway`'s output is
  templated placeholder text, not language understanding. Everything downstream of "call the
  model" is real: persistence, the review workflow, provenance, rate limiting, and audit.
- Rate limiting is implemented for real (an in-memory per-tenant daily cap) since it needs no
  vendor relationship to build; it is **in-memory and single-process only**, not persisted —
  acceptable for this phase, a real limitation to revisit before any multi-instance deployment.
- **Evaluation telemetry and hallucination-rate metrics are not implemented** — an explicit gap,
  the same treatment ADR-0002 gave MFA. `EHR_REGULATORY_MANUAL.md` §16.2 requires, per feature: an
  evaluation dataset, a hallucination/unsupported-fact metric, and subgroup/performance review.
  The `ai_generations` table is real substrate a future evaluation pipeline could query (every
  generation, every accept/reject/edit decision is durably recorded), but no eval harness exists.
- This repository must not send real PHI through `AiGateway` until: a BAA is signed with an
  approved vendor, that vendor is entered in the §16.2 governance table (`Model | Vendor | Version
  | Intended use | PHI allowed? | BAA | Evaluation set | Known risks | Owner | Last review` — for
  now, exactly one row: `NoopAiGateway | (none) | 1.0.0 | development/demo only | No — no data
  ever leaves this process | n/a | n/a | n/a | — | 2026-09-26`), and a real evaluation dataset
  exists for each feature that vendor backs.
- When a real vendor is integrated, expect a second `AiGateway` implementation
  (`packages/ai-adapter`) whose `isApprovedForPhi()` returns `true` only for tenants/features
  explicitly cleared in the governance table — not a global flip for every caller.

## Alternatives considered

- **Call a real hosted LLM now**, since this is a synthetic/dev environment with no real PHI.
  Rejected: the architectural point of `isApprovedForPhi()`/the governance table is to make "is
  this vendor relationship actually vetted" a real, checkable gate the code enforces — building
  the gate and then routing around it defeats the purpose, and the resulting code path would look
  production-ready in a way that invites exactly the mistake §16.1 warns against.
- **A separate ad hoc summarizer/helper per feature**, skipping the shared gateway. Rejected:
  violates §15.1's explicit "one internal gateway" requirement and would duplicate prompt-template
  versioning, redaction, and provenance-object construction 8 times instead of once.
- **Skip provenance/review persistence and just return generated text inline.** Rejected: spec
  §15.4's provenance object and §15.3's "never auto-applying" safety list are the actual point of
  Phase 9 — an AI feature with no persisted, reviewable record is not a smaller version of this
  phase, it is a different (and unsafe) feature.
