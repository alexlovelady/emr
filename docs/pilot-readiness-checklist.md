# Pilot readiness checklist

Mirrors `EHR_REGULATORY_MANUAL.md` §29's "Pre-pilot go/no-go gate" exactly, item for item. Per that
section: **do not place live PHI/patients into the system until all applicable boxes are complete.**
Every `[x]` below has real evidence behind it, pointed to inline. Every `[ ]` is a genuine, unmarked
gap with a one-line note on what it needs and who owns closing it — nothing here is checked off
without something real backing it.

## Legal/compliance

- [ ] Healthcare counsel reviewed pilot structure. — *Needs: licensed healthcare counsel engagement.*
- [ ] Company/customer MSA signed. — *Needs: an actual pilot customer.*
- [ ] BAA signed. — *Needs: a pilot customer and counsel-reviewed BAA.*
- [ ] AWS BAA active. — *N/A today (hosted on Railway per `docs/adr/0001-railway-hosting.md`, a
      documented pre-AWS-migration placeholder); needs: the AWS migration plus an AWS BAA once that
      happens.*
- [ ] All PHI subprocessors have required BAAs. — *No PHI subprocessors exist yet (object storage is
      a dev-only MinIO instance, no real PHI ever passes through it); needs: a real vendor list once
      production infrastructure is chosen.*
- [ ] HIPAA risk analysis completed with no unaccepted critical risks. — *Needs: a qualified
      privacy/security professional running a formal risk analysis against a real deployment.*
- [ ] Privacy/security policies approved. — *Needs: policies drafted and approved by someone with
      the authority to approve them (no such role exists in this engineering-only build).*
- [ ] Incident/breach plan approved. — *Same as above — needs a real approving authority.*
- [ ] Workforce training complete. — *N/A — no workforce exists yet to train.*
- [ ] Launch-state law matrix complete. — *Needs: state-by-state healthcare counsel review (the same
      gap already named explicitly in Phase 8's consent-model scope decisions for minor/proxy
      access rules).*

## Security

- [ ] MFA enforced. — *Real TOTP MFA is implemented and working (eCW/athena parity roadmap Phase
      H): `POST /api/v1/auth/mfa/{enroll,confirm,challenge}` do a genuine time-window TOTP check,
      not the old structural 501 stub — see README's Phase H scope decisions. Still unchecked
      because enrollment is opt-in per user (`mfa_enrolled`), not mandatory for every account.
      Needs: a decision + enforcement mechanism to require it fleet-wide before a pilot.*
- [x] Tenant-isolation tests passing. — 19 `domains/*/test/tenant-isolation.spec.ts` files plus this
      phase's `apps/api/src/e2e/golden-path.integration.test.ts` cross-tenant checks, all green
      under `pnpm turbo run test:tenant-isolation` (see this session's full-suite run).
- [ ] Independent penetration test complete; critical/high findings remediated or formally
      risk-accepted. — *Needs: a licensed, independent third-party firm — see
      `docs/security/pre-pilot-self-assessment.md`, which is explicitly not a substitute.*
- [ ] Central logging/security alerting active. — *`packages/observability` has real OpenTelemetry
      metrics/tracing scaffolding, but no alerting pipeline is wired to anything. Needs: a real
      monitoring/alerting stack in a real deployment.*
- [ ] Backups active. — *A real restore was manually drilled once (see below); no scheduled/
      automated backup job exists. Needs: an automated backup schedule in production.*
- [x] Full restore tested. — `docs/runbooks/backup-restore.md`'s "Last tested" section: a canary row
      and full table counts verified present in an independently-restored Postgres instance,
      2026-09-26.
- [ ] Support JIT access implemented. — *No support tooling or access model exists yet — see
      `docs/runbooks/support-operations.md`.*
- [ ] Secrets management operational. — *JWT keys are generated/loaded to local disk in dev with no
      rotation. Needs: real secrets-management infrastructure (e.g. a cloud KMS).*
- [ ] Vulnerability management process operational. — *A real, current `pnpm audit` snapshot exists
      (`docs/security/pre-pilot-self-assessment.md`) but no ongoing triage/remediation SLA process
      is operational.*

## Clinical

- [ ] Clinical hazard register reviewed. — *`EHR_REGULATORY_MANUAL.md` §24 lists the 17 hazards; a
      formally owned register (severity/likelihood/controls/test-case/monitoring/owner/residual-risk
      acceptance per hazard) does not exist. Needs: clinical safety governance ownership.*
- [x] Golden patient safety cases passing — *for the hazards with a real application-level control*:
      duplicate-patient merge/reverse-merge, signed-note immutability + amendment, diagnostic-report
      amendment, and critical-result → Task creation are all real, tested end to end in
      `apps/api/src/e2e/golden-path.integration.test.ts`. **Medication/allergy interaction checking
      now has real plumbing** (eCW/athena parity roadmap Phase K) — `PrescriptionService.create()`
      genuinely calls an `InteractionCheckGateway` with the patient's active medications/allergies —
      but the only implementation, `NoopInteractionCheckGateway`, always returns no findings because
      no licensed drug-interaction database is connected, and the prescribe UI says so explicitly.
      This is NOT a safety control yet, just a real seam ready for one. Medication dose/unit
      validation, unit conversion, and stale copied-forward note tracking still have no control at
      all. Building a real interaction check (a licensed vendor) and the remaining controls is out
      of scope for this phase — see `docs/security/pre-pilot-self-assessment.md` and this phase's
      README notes.
- [x] Wrong-patient protections tested. — Tenant-isolation (structural, RLS-backed) plus
      `DiagnosticReportService`'s encounter/patient consistency check, both exercised in the
      golden-path suite's cross-tenant test.
- [x] Signed-note amendment behavior validated. — Golden-path suite: a signed note rejects direct
      edits with a real `ConflictError`, and `amend()` never mutates the original.
- [x] Lab correction/critical-result workflows validated. — Golden-path suite: a `criticalFlag: true`
      diagnostic report genuinely opens a `critical_result_review` Task (not just setting the flag),
      and report amendment is additive.
- [ ] eRx workflow partner-approved if enabled. — *No real eRx vendor is connected
      (`packages/erx-adapter` is a `Noop` implementation, per Phase 5's own scope decisions); N/A
      until one is.*

## Interoperability

- [ ] FHIR conformance tests for claimed profiles. — *`apps/interop-fhir` has real integration tests
      for token issuance/verification and, as of the eCW/athena parity roadmap's Phase J, read/search
      routes for Patient/Observation/Encounter/Condition/AllergyIntolerance/MedicationRequest/
      DocumentReference — but no formal US Core conformance suite (e.g. Inferno) has been run against
      any of them. Needs: real conformance testing before claiming any profile support.*
- [ ] SMART flow tests. — *Token-level SMART client-credentials issuance is tested; a full
      authorization-code/launch-context flow has not been exercised end to end (no real EHR launch
      context exists to test against).*
- [ ] HL7 interfaces tested with actual partners. — *Only synthetic messages have been tested —
      ORU^R01 (results) plus, as of the eCW/athena parity roadmap's Phase J, ADT^A01/A02/A03/A08
      (demographics), SIU^S12/S14/S15 (scheduling), and ORM^O01 (orders) — all against
      `apps/interop-hl7`'s own integration tests, never a real sending lab/partner interface. Needs:
      a real partner connection.*
- [ ] C-CDA import/reconciliation tested if enabled. — *The reconciliation mechanism itself
      (`domains/clinical`'s external-candidate import/accept/reject/replace flow, Phase 4) is real
      and exists, but has not been tested against a real C-CDA document from a real source system.*
- [ ] Interface downtime/retry/DLQ procedures tested. — *HL7 ingestion is idempotent on redelivery
      (tested), but no dead-letter-queue or retry-scheduling mechanism exists structurally.*

## RCM

- [ ] Clearinghouse contract/BAA complete. — *`packages/clearinghouse-adapter` is a `Noop`
      implementation (Phase 6's own scope decision); no real clearinghouse relationship exists.*
- [ ] Payer enrollments complete for pilot payers. — *N/A — no pilot payers exist.*
- [ ] Eligibility tested. — *Domain logic (`domains/payments`'s eligibility-check flow) is tested
      against the Noop clearinghouse gateway, not a real payer.*
- [ ] Test claims/acknowledgments completed. — *The full scrub → submit → 277CA-acceptance cycle is
      tested end to end against the Noop gateway and `apps/webhook-gateway`'s simulated inbound
      webhook (Phase 6), not a real clearinghouse.*
- [ ] ERA/remittance workflow reconciled. — *Remittance posting logic is tested against synthetic
      data (Phase 6), not a real ERA feed from a real payer.*
- [ ] Claim-resubmission logic tested. — *A versioned claim model exists (`ClaimVersionRepository`,
      Phase 6) supporting resubmission in principle, but a full denial → correction → resubmission
      cycle was not independently re-verified this phase.*

## Migration

- [ ] At least two dry runs completed. — *N/A until a pilot customer and their source EHR are known
      — there is no real legacy system to migrate from yet. The reusable import mechanism
      (`domains/clinical`'s external-candidate reconciliation, Phase 4) already exists and is real;
      running it as an actual "migration dry run" is meaningful once a real source system exists.*
- [ ] Reconciliation report reviewed by practice. — *N/A, same reason.*
- [ ] Documents validated. — *N/A, same reason.*
- [ ] Active meds/allergies/problems checked. — *N/A, same reason.*
- [ ] Future appointments checked. — *N/A, same reason.*
- [ ] Open A/R/claims checked if migrating RCM. — *N/A, same reason.*
- [ ] Final cutover signoff. — *N/A, same reason.*
