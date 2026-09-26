# consent

Phase 8 (EHR_BUILD_SPEC.md §17 / §26): patient proxy-grant model backing `@ehr/portal`'s
authorization. Owns `patient_proxy_grants` — explicit, effective-dated, scoped grants linking a
`portal_accounts` row to a `patients` row, with `relationship_type` in `self | parent | guardian |
caregiver | other`.

`ConsentService.assertAccess(trx, tenantId, portalAccountId, patientId)` is the load-bearing method
every portal-facing route in `@ehr/portal` and `@ehr/messaging` calls first — it throws
`NotFoundError` (404, not 403) whenever no active, in-window grant exists, so a portal caller can
never distinguish "no such patient" from "not your patient."

Self-access is just another grant (`relationship_type: 'self'`), auto-created by
`ConsentService.createSelfGrant()` during portal registration — no special-casing anywhere in the
authorization code. `scope` exists as a real column but is not yet enforced per-category (any
active grant currently grants full access). Minor/state-law consent transition rules are
explicitly NOT computed here — see migration `0029_patient_proxy_grants.ts`'s doc comment.

The staff-facing controller (`PROXY_GRANT_MANAGE` permission) covers create/list/revoke; portal
accounts never manage their own grants through this API.
