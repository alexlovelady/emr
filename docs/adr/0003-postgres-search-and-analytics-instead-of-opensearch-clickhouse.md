# ADR-0003: Postgres full-text search and query compiler instead of OpenSearch/ClickHouse

## Status

Accepted — 2026-09-26

## Context

`EHR_BUILD_SPEC.md` §2.1 specifies two more external managed services Phase 7 ("Query platform")
as scoped does not actually need yet:

1. **Search** — "Amazon OpenSearch Service" for "full-text/global search with tenant/sensitivity
   filters" (spec §9).
2. **Analytics** — "ClickHouse Cloud or AWS-hosted equivalent approved for PHI" for "cohorts/ops/
   analytics; isolate from writer DB" (spec §2.1), backing the cohort query compiler (spec §8.3).

ADR-0002 already anticipated this exact gap when it deferred the event bus: *"When Phase 4/7
needs real multi-consumer fan-out (search indexing, analytics CDC, interop), only [the
`EventPublisher`] interface's implementation changes."* That anticipation was about the
**transport** (how index-update events would fan out); this ADR is about the **destination**
(what actually stores and serves the search/analytics workload) — no managed OpenSearch cluster or
ClickHouse warehouse exists in this environment, and standing either up requires real cloud
infrastructure and spend before a genuine multi-tenant workload justifies it, the same reasoning
ADR-0002 already applied to Kafka.

Spec §8.3's own compiler pipeline never actually requires ClickHouse by name — it says "execute
against analytics/read models," and at this project's data scale (synthetic dev tenants, not
millions of real patients) Postgres itself is a completely adequate analytics target for every
step the pipeline specifies, including a genuine cost estimate (via `EXPLAIN`). Similarly, spec §9
never requires OpenSearch specifically, only that authorization filter *inside* the search query
rather than after retrieval — a rule Postgres's own row-level `WHERE` clause satisfies exactly as
directly as an OpenSearch filter context would.

## Decision

**Search:** Implement a real `SearchIndexGateway` interface (`packages/search-adapter`) with a
**working** Postgres implementation (`PostgresSearchIndexGateway`) — a `tsvector`/GIN-indexed
`search_documents` table, `websearch_to_tsquery`/`ts_rank` for querying, and the sensitivity/
context-tag filtering applied directly in the `WHERE` clause per spec §9's explicit rule. This is
the same "real substitute using infrastructure we already have, not a fake stub" posture ADR-0002
used for the outbox standing in for Kafka.

Indexing is triggered by an explicit `POST /search/reindex` admin action performing a full
tenant-wide scan-and-upsert, **not** a live outbox-consumer keeping the index continuously fresh.
This is a further, explicitly scoped-down step from ADR-0002's anticipated "consumer of outbox
events" shape — a real outbox-driven indexer-worker is a natural, low-risk follow-on (the outbox
events these writes already produce are sufficient to drive it) but is not built this pass. Only
three representative resource types are wired end to end (Patient, Document, Claim) rather than
all seven spec §9 lists — see `domains/query`'s own scope documentation for the full list of
what's deferred.

**Cohort analytics:** The query compiler (`domains/query/src/cohort/cohort-compiler.ts`) executes
spec §8.3's DSL directly against the primary Postgres database inside the caller's own
tenant-scoped transaction, including a genuine cost estimate via `EXPLAIN (FORMAT JSON)` rather
than a fabricated number. No separate analytics warehouse or CDC pipeline exists; every query
therefore has zero replication lag by construction (the `asOf` freshness timestamp this pipeline
returns is always "now," where a real ClickHouse/CDC setup would carry some real lag).

## Consequences

- No OpenSearch cluster or ClickHouse warehouse exists. At this project's synthetic-tenant data
  scale this has no functional cost; at real production scale (spec's own benchmark: "pre-indexed
  cohort over ~1M patients: <5s," spec §24) a `WHERE`-clause-per-condition compiler against the
  primary transactional database would eventually contend with write traffic and degrade — a real
  limitation to revisit before any production pilot at that scale, not before.
- Search indexing can drift from the canonical tables between reindex runs, since there is no
  live on-write indexing hook. A staff member searching immediately after a write may not find it
  until the next `POST /search/reindex`. Wiring the existing outbox events into a live
  indexer-worker (as ADR-0002 anticipated) closes this gap without changing
  `SearchIndexGateway`'s interface.
- The cohort compiler's `EXPLAIN`-based row estimate is a genuine Postgres planner estimate, which
  can differ meaningfully from the actual result count on a small or poorly-vacuumed table — this
  is real planner behavior, not a bug, and matches what a production analytics engine's own cost
  estimator would also do.
- When OpenSearch/ClickHouse are eventually integrated, expect to add a second
  `SearchIndexGateway` implementation and a separate CDC pipeline feeding it — not addressed here
  since it is out of scope until a real multi-tenant search/analytics workload justifies the
  vendor cost, per the same reasoning ADR-0002 applied to the event bus.

## Alternatives considered

- **Stand up OpenSearch/ClickHouse now "to do it right the first time."** Rejected: no workload
  exists yet to justify the operational cost, and the spec's own build order treats search/
  analytics infrastructure choice as a technology decision separate from the actual product
  requirement (a real cohort DSL and a real, authorization-filtered search query).
- **Skip the query compiler's cost estimate and hardcode a placeholder number.** Rejected: spec
  §8.3 explicitly lists "estimate query cost" as a required pipeline step, and Postgres's own
  `EXPLAIN` makes a genuine estimate cheap to obtain — a fabricated number would be strictly worse
  than not implementing the step at all.
- **Build a general SQL parser/executor for "governed SQL for internal analysts."** Rejected:
  spec §8.3 itself opens with "Do not expose unrestricted SQL to normal customers," and a
  general SQL-subset parser is a large, security-critical undertaking (a real injection surface if
  done casually) disproportionate to this pass — see `domains/query`'s governed-query registry for
  the safer, parameterized-catalog alternative actually built.
