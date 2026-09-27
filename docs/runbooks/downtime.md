# Downtime & business continuity runbook

`EHR_REGULATORY_MANUAL.md` §25 lists what must exist before production: RTO/RPO approval, a
downtime clinical workflow, a read-only contingency option, paper/alternate procedures, lab/result
backlog reconciliation, prescribing/claims outage procedures, a restore runbook, a communications
tree, and a status page/incident communication plan. This document states plainly what's real today
versus what's a named gap — it is a starting point for a pilot customer conversation, not a
completed program.

## What's real today

- **Write durability**: every domain write and its corresponding `outbox_events` row commit in the
  same Postgres transaction (`packages/db`'s `withTenantContext`) — a crash between "the domain
  write happened" and "the event was published" cannot lose the write itself, only delay downstream
  event consumers (see `docs/adr/0002-deferred-event-bus-and-idp.md`).
- **Tenant isolation holds under partial failure**: Row-Level Security is enforced by Postgres
  itself, not application logic that could be half-applied during an incident — confirmed by the 19
  `domains/*/test/tenant-isolation.spec.ts` suites and this phase's golden-path E2E suite.
- **A tested restore mechanism exists** — see `docs/runbooks/backup-restore.md`. This is the single
  most concrete, evidence-backed downtime-related capability this system has today.

## What is a real, named gap

- **No RTO/RPO figures exist**, approved or otherwise — there is no production deployment, no SLA,
  and no customer to approve one against. This must be a real conversation with the first pilot
  customer, not a number invented here.
- **No automated failover/high availability** — Railway hosting (ADR-0001) as currently configured
  is a single-instance deployment target; an infrastructure outage is a full outage, not a failover.
- **No read-only contingency mode** — if the primary database is unavailable, the application has no
  degraded-but-functional mode; it is fully up or fully down.
- **No status page or incident-communication tooling** — no mechanism exists today to notify
  customers of an outage other than direct, ad hoc contact.
- **No lab/result backlog reconciliation procedure** — if HL7 ingestion (`apps/interop-hl7`) is down
  for a period, there is no documented process for confirming which results eventually arrived vs.
  were lost in transit at the sending lab's side (the ingestion pipeline itself is idempotent and
  durable once a message reaches it — see its integration test — but that doesn't cover messages
  that never made it here at all).
- **No prescribing-outage or claims-outage procedure** — both `packages/erx-adapter` and
  `packages/clearinghouse-adapter` are currently `Noop` implementations (no real vendor connected
  yet — see ADR-0002-style deferrals in each domain's README), so there is no real vendor outage to
  have a procedure for yet; this must be written once a real eRx/clearinghouse vendor is integrated.

## Paper/alternate-procedure outline (for the workflows that exist today)

This is a plain-language description of what staff would need to do manually if the system were
unavailable, for each golden-path workflow Phases 1–9 actually built. It is a starting outline for a
real clinical-operations conversation, not a validated, drilled procedure.

- **Scheduling**: fall back to a paper or spreadsheet appointment book; re-enter confirmed
  appointments once the system is back, cross-checking for double-booking.
- **Clinical documentation**: use paper encounter notes; once restored, a clinician enters them as
  signed notes with the real encounter date (not the re-entry date) — `NoteService.create()` accepts
  an explicit `encounterId` but there is no "backdate a note" flag today, a real gap to close before
  relying on this for backfill at any scale.
- **Orders/results**: hold new lab/imaging orders if the ordering workflow is down; for results
  already in transit at the lab, expect a backlog on system restoration (see gap above) and manually
  cross-check nothing was dropped.
- **Billing**: hold new charge capture; nothing here is time-sensitive enough to require a paper
  workaround for a short outage, but a prolonged one needs manual charge tracking to reconcile later.
- **Patient portal**: has no offline mode — a portal outage means patients cannot message, view
  results, or pay bills until restoration; there is no current alternate channel.

## Communications tree

Not established — there is no pilot customer or support organization yet to define escalation
contacts for. This section will be filled in as part of real customer onboarding
(`EHR_REGULATORY_MANUAL.md` §26, item 14: "go-live support plan," item 15: "downtime procedure
shared").
