# Manual action items — closing the eCW/athenahealth parity gap

This is the companion to the engineering roadmap (see the plan file / commit history for the
phased build-out). Everything here is **not code** — it needs a person, a signature, a contract, an
application, or a professional service. No amount of implementation work closes these; they're
listed so nothing gets silently assumed "done" once the corresponding adapter/interface exists in
code. Where an item overlaps `docs/pilot-readiness-checklist.md` or
`docs/security/pre-pilot-self-assessment.md`, it's cross-referenced rather than restated in full —
those two documents remain the authoritative pre-pilot gate.

Check items off as you actually complete them — this file is meant to be edited over time, not
regenerated.

## 1. Legal & compliance foundation (blocks everything else)

- [ ] Engage healthcare/HIPAA counsel — needed before any of the items below can be done correctly.
- [ ] Decide the corporate/business structure for who is "the covered entity" vs. "the business
      associate" once there's a real pilot customer.
- [ ] Draft and get counsel sign-off on: privacy policy, security policy, incident/breach response
      plan, workforce HIPAA training materials.
- [ ] Commission a formal HIPAA risk analysis against the real (not dev) deployment once one exists.
- [ ] Commission an independent penetration test from a licensed third-party firm.
- [ ] State-by-state legal review for any state you plan to operate in (consent law for minors,
      e-prescribing mandates, telehealth licensure if ever added, substance-use-record rules).
- See `docs/pilot-readiness-checklist.md`'s "Legal/compliance" and "Security" sections for the full
  itemized pre-pilot gate — this bullet list is a subset, that file is the complete one.

## 2. Vendor contracts — one per stubbed (`Noop*`) adapter

Each of these has a real interface already built in code (`packages/*-adapter`) — swapping in a real
implementation is an engineering task *after* the contract exists, not before. Nothing below can be
"built around" — every one requires an actual signed agreement with a company:

- [ ] **Clearinghouse** (claims/eligibility) — e.g. Availity, Change Healthcare, Waystar. Needs a
      signed contract + BAA before `NoopClearinghouseGateway` can be replaced. This is the single
      highest-value vendor relationship for RCM parity with athenahealth.
- [ ] **E-prescribing network** — Surescripts (the only real network in the US) or a certified
      reseller/partner. Getting connected involves Surescripts' own certification process, which
      takes real calendar time (often months) independent of engineering effort.
- [ ] **EPCS identity-proofing + 2FA vendor** — required by DEA rule before controlled-substance
      e-prescribing can be enabled at all (e.g. Surescripts' own EPCS identity-proofing flow, or a
      third-party like Experian Health / LexisNexis for identity proofing).
- [ ] **SMS/email delivery** — e.g. Twilio, SendGrid/Postmark — needed before `NoopNotificationGateway`
      can send real appointment reminders/recalls. Low effort to contract, but still a real account +
      billing relationship + compliance review (texts touching PHI need a BAA-covered vendor).
- [ ] **Payment processor** — e.g. Stripe, a healthcare-specific processor (InstaMed, Rectangle
      Health) — needed before `NoopPaymentGateway` can process a real card. Healthcare-specific
      processors often bundle patient statement/portal-pay features athenahealth also offers.
- [ ] **Lab interface vendor/direct relationships** — Quest, LabCorp, or a lab-interface aggregator
      (e.g. Health Gorilla, Lyniate) for real bidirectional order/result interfaces beyond the
      currently-stubbed `NoopLabOrderGateway`.
- [ ] **LLM vendor with a signed BAA** — needed before `NoopAiGateway` can be replaced with anything
      that touches real PHI. Per `docs/adr/0004-deferred-ai-vendor.md`, this also requires adding a
      row to the AI governance table per feature/tenant — not a single global switch.
- [ ] **Imaging/PACS vendor** — no adapter exists yet even as a stub; if imaging is ever in scope,
      this starts from a vendor relationship, not existing code.
- [ ] **Fax vendor** (e.g. SRFax, Sfax, or a HIE-integrated fax-to-Direct bridge) — still load-bearing
      for referrals and records requests; no adapter or stub exists yet.
- [ ] **HIE participation** — CommonWell, Carequality, or a regional HIE — each has its own
      onboarding process, attestation requirements, and often a fee.

## 3. Certifications & regulatory filings

- [ ] **ONC Health IT Certification** (2015 Edition Cures Update) — required if any customer needs to
      attest to MIPS/Promoting Interoperability using this system. This is a formal, audited
      certification process against an ONC-Authorized Testing Lab (ONC-ATL) and Certification Body
      (ONC-ACB) — ~several months, real cost, and requires the product to already meet the criteria
      being tested (FHIR US Core conformance, C-CDA, etc. — see the engineering roadmap for what code
      work is a prerequisite).
- [ ] **DEA registration/EPCS certification** — separate from the identity-proofing vendor above;
      the EPCS certification itself (per 21 CFR Part 1311) needs a certified auditor review.
- [ ] **SOC 2 Type II** and/or **HITRUST CSF** certification — not legally required but increasingly
      a hard procurement requirement for health-system customers. Requires an audit firm engagement
      and typically 6-12 months of evidenced operational maturity before the audit period even starts.
- [ ] **State health department registrations** for immunization registry (IIS) and public health
      reporting (ELR, syndromic surveillance) — per-state, needed before those interfaces can go live
      even after the code exists.
- [ ] **Payer enrollment** — each payer you plan to bill electronically requires its own enrollment
      (EDI enrollment forms, sometimes a clearinghouse-mediated process) before real claims will be
      accepted, independent of the clearinghouse contract itself.

## 4. Security & operational maturity requiring outside parties or real infra spend

- [ ] AWS account + BAA (if migrating off Railway per `docs/adr/0001-railway-hosting.md`) — a
      business/legal step (signing AWS's BAA) that gates a large engineering migration, not the
      other way around.
- [ ] Cloud KMS / secrets-management service selection and procurement (e.g. AWS KMS/Secrets
      Manager, HashiCorp Vault Cloud) — a vendor/infra decision before the key-rotation engineering
      work in the roadmap can be finished.
- [ ] Central logging/SIEM vendor (e.g. Datadog, Splunk) if you want managed alerting rather than
      self-hosting the OpenTelemetry pipeline already scaffolded in `packages/observability`.
- [ ] Incident-response tabletop exercise — needs a real (even if small) team to run, not just a
      written plan.
- See `docs/security/pre-pilot-self-assessment.md` for the full self-assessed status of every item
  in this category.

## 5. This session's action

- [x] GitHub remote added and pushed — `https://github.com/alexlovelady/emr` (private). Nothing
      further needed here unless you want branch protection rules, required CI checks, or a
      different visibility setting — all doable from GitHub's own settings UI, not something to
      script blindly against your account.
