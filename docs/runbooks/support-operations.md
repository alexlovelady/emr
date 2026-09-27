# Support operations runbook

`EHR_REGULATORY_MANUAL.md` §28 requires severity levels defined before go-live, and warns: "Do not
advertise response targets that staffing cannot meet." This document defines P1–P4 concretely
against this system's actual features. **No real support organization or on-call rotation exists
yet** — these definitions classify incidents; they do not imply any staffed response-time
commitment until a real team exists to honor one.

## Severity definitions

### P1 — patient-safety risk, broad outage, security incident, or inability to access critical chart functions

Examples specific to this system:
- A tenant-isolation failure — any confirmed instance of one tenant's data becoming visible to
  another (would contradict every `tenant-isolation.spec.ts` guarantee this build makes).
- Auth/JWKS outage — `apps/api`'s `/.well-known/jwks.json` or login/token-refresh path down,
  blocking all staff and portal access tenant-wide.
- Inability to review a flagged critical diagnostic result — the `critical_result_review` Task
  pipeline (`domains/results` → `domains/tasks`) silently failing to create or surface tasks.
- Data loss or corruption in a way the restore drill (`docs/runbooks/backup-restore.md`) would not
  recover from.

### P2 — major workflow degraded without an acceptable workaround

Examples: claims submission failing tenant-wide (`domains/claims`), the patient portal entirely
unreachable while the staff-facing API remains up, HL7 result ingestion failing for one interface
partner.

### P3 — limited defect with a workaround

Examples: a single feature returning an incorrect-but-non-harmful value (e.g. a search-index
staleness issue correctable by re-running `POST /search/reindex`), a UI-adjacent defect once a
frontend exists.

### P4 — question or enhancement request

No workflow impact; a request for new functionality or clarification.

## Escalation

**Not yet defined for real.** §28 requires "real 24×7 escalation if you contractually promise it" —
no contract, no pilot customer, and no staffed on-call rotation exist yet. This section must be
completed with real named owners and paging tooling before any P1 commitment is made to a customer.

## Support tooling and PHI

Per §28: "Support tooling handling PHI must be BAA-approved and configured to minimize copied PHI."
No support tooling has been selected yet (no ticketing system, no session-recording/screen-share
tool). This must be chosen and BAA-reviewed (regulatory manual §16.1-style vendor review) before any
support interaction that could touch real PHI — not before this dev-only build, which never handles
real PHI at all (see the standing project-wide rule: "never place real PHI in this system").
