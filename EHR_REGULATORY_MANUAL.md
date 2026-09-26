# EHR_REGULATORY_MANUAL.md

> **Purpose:** Founder/operator checklist for the non-code work required to launch and operate a U.S. ambulatory EHR.
> **Current as of:** September 2026
> **Important:** This is an implementation/compliance planning manual, not legal advice. State-specific law, certification scope, prescribing, billing, and specialty requirements must be validated by qualified professionals before production use.

---

# 1. The most important distinction

An EHR is not “HIPAA compliant” because it encrypts a database or runs on a cloud vendor that signs a BAA.

You are building a company that will likely act as a **HIPAA business associate** to covered-entity customers. Compliance therefore includes software controls **and** contracts, policies, workforce practices, risk analysis, training, vendor management, incident response, documentation, evidence, and recurring reviews.

Likewise, **ONC certification is not automatically required simply because software stores medical records**, but it can become commercially or programmatically important depending on customer needs, federal program participation, interoperability promises, and certification claims. Decide the certification strategy early because retrofitting it late is expensive.

---

# 2. Requirement labels used in this manual

- **REQUIRED:** generally required when the stated condition applies.
- **CONDITIONAL:** only required for certain product/customer/state/specialty activities.
- **BEST PRACTICE / COMMERCIAL:** not universally imposed by statute, but commonly expected or risk-reducing.
- **VALIDATE:** requires qualified legal/compliance/certification interpretation before relying on it.

---

# 3. Pre-company / pre-pilot legal setup

## 3.1 Engage specialists

| Item | Status | Applies | Owner | Evidence |
|---|---|---|---|---|
| Healthcare/privacy attorney | BEST PRACTICE, effectively critical | Before pilot contracts | CEO/Legal | Engagement letter, advice memos |
| HIPAA/privacy compliance lead | REQUIRED operational responsibility; title may vary | Before handling PHI | CEO/Compliance | Named role, job duties |
| Security officer/function | REQUIRED under HIPAA Security Rule for regulated entity | Before handling ePHI | Security | Appointment record |
| Clinical informatics advisor | BEST PRACTICE | Before clinical workflow release | Product | Review minutes/signoffs |
| Billing/coding specialist | BEST PRACTICE; CONDITIONAL to RCM scope | Before claims workflow | RCM | Validation records |
| ONC certification consultant/ATL/ACB discovery | CONDITIONAL | If pursuing certification | Compliance/Product | Scope matrix |
| EPCS/eRx partner compliance team | CONDITIONAL | If eRx/EPCS | Product/Legal | Partner approvals |

## 3.2 Entity/contracts

Before pilot:

- form operating company;
- appropriate business insurance;
- cyber liability policy discussion;
- master services agreement;
- Business Associate Agreement template;
- data processing/security addendum;
- service-level terms;
- acceptable use terms;
- subcontractor/subprocessor terms;
- confidentiality/IP agreements;
- incident notification obligations;
- customer offboarding/data-export language;
- retention/deletion responsibilities;
- limitation-of-liability and indemnity reviewed by healthcare counsel.

**Do not copy a generic SaaS MSA and add the word HIPAA.**

---

# 4. HIPAA program

## 4.1 Determine role

**REQUIRED/VALIDATE**

For a SaaS EHR storing or processing PHI on behalf of healthcare providers, expect the company to be a business associate for those customers.

Maintain a written data-flow/role map for:

- company;
- covered-entity customers;
- cloud provider;
- AI vendors;
- eRx vendor;
- clearinghouse;
- messaging/fax vendors;
- support tools;
- consultants/subcontractors.

Subcontractors that handle PHI for your business-associate functions may themselves need BAAs.

## 4.2 BAA register

Maintain a table:

```text
Vendor | Service | PHI? | BAA signed? | Subprocessors reviewed? | Security review date | Renewal | Owner
```

No PHI moves to a vendor until the table shows approved.

## 4.3 HIPAA risk analysis

**REQUIRED.** HHS OCR continues to emphasize accurate and thorough risk analysis as a legal obligation.

Perform before pilot and update when meaningful changes occur.

Minimum process:

1. inventory systems/data flows containing ePHI;
2. identify threats/vulnerabilities;
3. assess likelihood/impact;
4. document existing safeguards;
5. calculate/document risk level;
6. assign remediation owner/date;
7. accept residual risk through named authority;
8. re-evaluate changes/incidents.

Evidence:

- asset inventory;
- system/data-flow diagrams;
- risk register;
- remediation tickets;
- management approval;
- review dates.

## 4.4 Security Rule program

The Security Rule currently in effect requires administrative, physical, and technical safeguards. HHS's December 2024 modernization remains presented by HHS as a **proposed rule** as of this research date; do not describe every proposed control as already-effective federal law. Design toward the stronger posture anyway.

Policies/procedures should cover at minimum:

- security management process;
- assigned security responsibility;
- workforce security;
- information-access management;
- security awareness/training;
- security incident procedures;
- contingency planning;
- evaluation;
- business-associate/subcontractor arrangements;
- facility/device/media controls as applicable;
- access control;
- audit controls;
- integrity;
- authentication;
- transmission security.

## 4.5 Privacy Rule operations

Create procedures for:

- uses/disclosures;
- minimum necessary where applicable;
- individual access requests;
- amendment requests;
- restrictions/confidential communications;
- accounting of disclosures where applicable;
- authorization workflows;
- personal representatives/proxies;
- complaint handling;
- sanctions;
- Notice of Privacy Practices support where your customer workflow requires it.

The provider/customer remains responsible for many covered-entity obligations, but your software and BA processes must not prevent them from meeting those obligations.

---

# 5. Breach and incident response

## 5.1 Required incident plan

Before pilot, create and tabletop:

- security incident response plan;
- privacy incident intake;
- breach risk-assessment template;
- customer notification playbook;
- evidence preservation procedure;
- ransomware playbook;
- lost credential/token playbook;
- vendor incident playbook;
- law-enforcement/forensics escalation contacts.

## 5.2 Breach assessment

Suspected impermissible PHI access/use/disclosure requires a documented assessment under applicable HIPAA rules; do not let engineers decide “it was probably fine” in Slack.

Track:

- PHI nature/extent;
- person/entity receiving/accessing;
- whether PHI was actually acquired/viewed;
- mitigation;
- affected tenants/patients;
- time window;
- systems/resources;
- legal determination;
- required notifications and deadlines.

HIPAA breach notification obligations can include notification without unreasonable delay and no later than the applicable 60-day outer limit for affected individuals, with additional HHS/media rules depending on breach size/circumstances. Counsel/compliance must own the determination.

---

# 6. Workforce compliance

Before employees/contractors get PHI access:

- confidentiality agreement;
- role/background process appropriate to responsibility;
- HIPAA/security training;
- phishing/security training;
- acceptable-use policy;
- least-privilege account;
- MFA;
- managed device controls;
- support-access procedures;
- sanction policy acknowledgment.

Recurring:

- training at hire and according to policy/regulatory changes;
- access reviews;
- privileged access reviews;
- termination/deprovisioning checks;
- phishing exercises if adopted;
- policy acknowledgments.

---

# 7. Cloud and infrastructure compliance

## 7.1 AWS

Before PHI:

- execute AWS BAA;
- designate/configure HIPAA workloads correctly;
- verify each service processing/storing/transmitting ePHI is within AWS's current HIPAA-eligible scope;
- document shared-responsibility controls.

AWS explicitly states that a BAA/eligible service does not remove the customer's obligation to configure and operate the service appropriately.

Evidence:

- BAA;
- architecture diagram;
- service eligibility review;
- encryption configuration;
- logging configuration;
- access-control evidence;
- backup/restore test evidence.

---

# 8. Vendor/subprocessor governance

For every vendor that may touch PHI or production security:

1. purpose and data categories;
2. minimum necessary data;
3. BAA requirement;
4. SOC 2/HITRUST/penetration-test review when available;
5. subprocessor list;
6. data location;
7. encryption/access controls;
8. retention/deletion;
9. incident notification terms;
10. business continuity;
11. termination/export;
12. annual or risk-based reassessment.

Do not treat a SOC 2 report as proof of HIPAA compliance. Do not treat HITRUST certification as a statutory requirement unless a contract/customer requires it.

---

# 9. ONC/ASTP certification strategy

## 9.1 Decide early

**CONDITIONAL but strategically important.**

Questions for counsel/certification specialist:

- Will target customers require Certified Health IT?
- Which certification edition/criteria apply at test time?
- Are we certifying a complete EHR or modular capabilities?
- Do customer CMS quality/payment programs depend on certified functionality?
- Which decision-support/AI features trigger certified-health-IT requirements?

## 9.2 Current 2026 baseline facts

As of September 2026:

- HTI-1 made **USCDI v3** the certification baseline beginning January 1, 2026.
- §170.315(g)(10) references FHIR R4 and **US Core 6.1.0** as the current regulatory baseline.
- 2026 SVAP makes newer approved standards available voluntarily, including **US Core 9.0.0**.
- SMART App Launch and Bulk FHIR requirements apply within standardized API criteria according to the applicable standard/version.

Do not hard-code certification versions into the domain model.

## 9.3 Certification workstream

If certification is pursued, maintain a criterion matrix:

```text
Criterion | Applies? | Product owner | Technical owner | Test method | Evidence | Status | External dependency
```

Potentially relevant categories include:

- transitions of care;
- reconciliation/incorporation;
- demographics/USCDI;
- standardized API;
- patient access;
- EHI export;
- privacy/security criteria;
- safety-enhanced design;
- quality-management-system expectations;
- accessibility-centered design;
- decision support/intervention transparency where applicable;
- public health/quality reporting if in scope.

Lock exact certification scope with an ONC Authorized Testing Laboratory/Certification Body before representing the product as certified.

## 9.4 Real World Testing / Conditions of Certification

**CONDITIONAL:** applies to certified health IT developers according to certification-program requirements.

Create an annual compliance calendar for:

- Real World Testing plans/results where required;
- attestations;
- surveillance;
- certification maintenance;
- API conditions/practices;
- Insights reporting or other applicable Conditions of Certification;
- SVAP version decisions.

---

# 10. Information blocking and export

If operating certified health IT and/or participating in activities covered by information-blocking rules, obtain legal guidance on actors, EHI scope, exceptions, and practices.

Product posture should nevertheless be straightforward:

- do not intentionally make lawful data access artificially difficult;
- publish standards APIs accurately;
- support customer/patient exports;
- document fees/terms transparently;
- maintain export logs;
- maintain API downtime/incident records;
- keep an EHI export capability on the product roadmap from the beginning.

Certification criterion §170.315(b)(10) EHI export may require single-patient and patient-population export functionality for certified modules according to applicable rules/test methods.

---

# 11. FHIR / SMART / interoperability obligations

Maintain:

- public FHIR documentation;
- generated `CapabilityStatement` reflecting deployed behavior;
- SMART configuration;
- test sandbox;
- API registration terms;
- version/deprecation policy;
- uptime/status process;
- conformance test evidence;
- Bulk FHIR tests if in scope;
- US Core profile/version matrix;
- C-CDA validation/reconciliation tests;
- HL7 v2 partner interface specifications.

Do not claim “FHIR compatible” based on exporting one JSON file. Validate the profiles/behaviors you claim.

---

# 12. ePrescribing and EPCS

## 12.1 Ordinary ePrescribing

**CONDITIONAL:** if product sends prescriptions electronically.

Do not assume a normal API integration is enough. Use a connected partner and validate:

- Surescripts/network relationship;
- prescriber identity;
- NPI/DEA/state-license requirements;
- formulary/benefit data terms;
- medication history terms;
- state e-prescribing mandates;
- controlled-substance rules;
- PDMP workflows where applicable.

## 12.2 EPCS

**CONDITIONAL and high-risk.**

Controlled-substance prescribing has additional DEA requirements and implementation/certification/identity/authentication obligations. Use an experienced EPCS vendor and healthcare counsel. Do not launch EPCS from an internally improvised MFA flow.

Create a separate go-live gate with:

- partner certification/approval;
- prescriber identity proofing;
- two-factor authentication/token requirements;
- logical access controls;
- audit requirements;
- state PDMP integration/mandates;
- controlled-substance incident procedures.

---

# 13. Revenue cycle / clearinghouse / X12

## 13.1 Clearinghouse relationship

Use an established clearinghouse/API partner rather than becoming a clearinghouse network initially.

Operational setup may require:

- provider enrollment;
- payer-specific enrollments;
- submitter IDs;
- ERA enrollment;
- EFT enrollment;
- payer agreements;
- test transactions;
- production cutover coordination.

A current API-first example is Stedi, whose documentation supports 270/271 eligibility, 837 claims, 276/277 claim status, 277CA acknowledgments and 835 ERAs, including test-mode tooling.

## 13.2 Code sets/licensing

Track legal/licensing status for:

- ICD-10-CM;
- HCPCS;
- CPT (AMA licensing generally relevant to use/distribution);
- SNOMED CT;
- LOINC;
- RxNorm;
- NDC where used;
- payer proprietary rules/content.

Do not copy code descriptions or proprietary payer edits from a competitor's database.

---

# 14. Laboratory/CLIA boundary

If the EHR only sends orders and receives lab results, the company is not thereby operating the laboratory.

If the product expands into running tests, instrument management, point-of-care testing workflows, or an LIS-like role, obtain a separate CLIA/state-lab/FDA assessment.

Even as an EHR integration, operational policies must address:

- result matching;
- amended/corrected results;
- critical values;
- units/reference ranges;
- specimen identity;
- missing/duplicate messages;
- downtime and delayed results;
- clinician acknowledgement.

---

# 15. Imaging

Do not build a PACS from scratch initially.

For DICOM/DICOMweb integrations:

- establish BAA/vendor terms;
- retain identifiers/provenance;
- ensure links/tokens are access-controlled;
- define retention responsibility;
- confirm diagnostic viewing requirements if claiming diagnostic use;
- validate whether FDA/device regulations become relevant to any image-processing/diagnostic AI functionality.

---

# 16. AI/ML governance

## 16.1 AI vendor review

Before PHI use:

- BAA;
- training/data-use terms;
- retention policy;
- human review expectations;
- region/data residency;
- subprocessors;
- security review;
- model change policy;
- deletion/termination process.

Consumer chatbot/API terms that permit provider training on PHI or lack a BAA are not acceptable for production PHI.

## 16.2 Internal AI governance

Maintain:

```text
Model | Vendor | Version | Intended use | PHI allowed? | BAA | Evaluation set | Known risks | Owner | Last review
```

For each clinical AI feature:

- intended use;
- prohibited use;
- required human review;
- source/provenance presentation;
- hallucination/unsupported-fact metric;
- evaluation dataset;
- subgroup/performance review where relevant;
- rollback switch;
- change-control process.

## 16.3 FDA/CDS review

**CONDITIONAL/VALIDATE.**

If AI moves beyond documentation/administrative assistance into patient-specific diagnosis/treatment recommendations or device-like functions, obtain regulatory counsel to assess FDA software/device/CDS boundaries before launch.

---

# 17. 42 CFR Part 2 and sensitive data

**CONDITIONAL.**

If customers handle federally protected substance-use-disorder records covered by 42 CFR Part 2, perform a dedicated legal/workflow review.

Architecture should support:

- sensitivity tags;
- consent/effective dates;
- purpose/context policies;
- segmented disclosure where required;
- redisclosure/notice requirements where applicable;
- auditing.

Do not assume HIPAA permissions automatically solve Part 2.

---

# 18. State-law program

This is one of the largest manual workstreams.

Before launch in each state, create an effective-dated legal matrix covering at least:

- medical-record retention;
- patient access response timing/fees;
- minor consent and confidentiality;
- parental/proxy access;
- behavioral/mental health;
- SUD;
- HIV/STI;
- genetic information;
- reproductive-health information;
- telehealth;
- electronic prescribing/EPCS;
- PDMP;
- breach notification;
- biometric/privacy laws if used;
- consumer health-data laws where applicable;
- data destruction.

Do not encode this as thousands of `if state == X` statements. Legal requirements should feed an effective-dated policy/configuration layer.

---

# 19. Patient rights operational manual

Define a ticketed workflow for:

## Access/export

- verify identity/authority;
- identify scope;
- route to customer/privacy owner;
- produce approved format;
- track date received/completed;
- log disclosures/downloads;
- retain evidence.

## Amendment

- receive request;
- route to covered entity/clinical owner;
- do not overwrite original signed record;
- record acceptance/denial according to customer/legal process;
- link amendment to original.

## Proxy/personal representative

- authority evidence;
- scope;
- start/end dates;
- minor transition rules;
- revocation.

---

# 20. Record retention and destruction

There is no single universal “HIPAA medical record retention period” that solves every record category. HIPAA has documentation-retention requirements, while medical-record retention often depends on state law, payer contracts, specialty, minors, litigation, and customer policy.

Create a matrix by record type and jurisdiction.

Product must support:

- retention policy assignment;
- legal hold;
- customer offboarding hold/export;
- secure destruction;
- deletion certificates/logs where appropriate;
- immutable audit evidence retained separately according to policy.

Do not promise immediate deletion if another legal/contractual retention duty applies.

---

# 21. Security assurance program

## 21.1 Before pilot

- HIPAA risk analysis;
- independent penetration test;
- cloud architecture review;
- tenant-isolation review;
- dependency/SBOM process;
- vulnerability management SLA;
- backup restore test;
- incident-response tabletop;
- access review;
- secrets/key rotation procedures;
- secure SDLC policy.

## 21.2 Recurring cadence

Suggested operating cadence (contract/risk can make stricter):

### Continuous
- vulnerability alerts;
- security monitoring;
- privileged-access monitoring;
- backup monitoring.

### Monthly
- critical/high vulnerability review;
- privileged accounts;
- vendor/security incidents;
- backup success.

### Quarterly
- user/access recertification for privileged roles;
- risk-register review;
- incident tabletop component or scenario rotation;
- BAA/subprocessor changes.

### At least annually / material change
- HIPAA risk analysis refresh;
- penetration test;
- policy review;
- workforce training refresh according to policy;
- vendor reassessment;
- business continuity/DR exercise;
- certification compliance calendar review.

These cadences are operating recommendations unless a law/contract requires a specific interval.

---

# 22. SOC 2 and HITRUST

## SOC 2

**COMMERCIAL/BEST PRACTICE**, not a universal HIPAA legal requirement.

Recommended path:

1. control framework mapped while building;
2. readiness assessment;
3. Type I if customer pressure requires early evidence;
4. Type II once operating history exists.

## HITRUST

**COMMERCIAL/CONDITIONAL**, not automatically required by HIPAA.

Consider when:

- enterprise health systems/payers demand it;
- procurement repeatedly blocks without it;
- company can sustain evidence/control overhead.

Do not spend early startup capital on a logo unless sales pipeline actually requires it.

---

# 23. Cyber insurance

**BEST PRACTICE / often contractually expected.**

Discuss coverage for:

- privacy breach;
- ransomware/cyber extortion;
- incident response/forensics;
- business interruption;
- regulatory defense/penalties where insurable;
- technology E&O;
- social engineering/funds transfer where relevant.

Ensure application answers match real controls; inaccurate representations can create coverage disputes.

---

# 24. Clinical safety governance

Create a clinical hazard register from the first pilot.

Minimum hazards:

- wrong patient;
- duplicate patient;
- medication/allergy mismatch;
- medication unit/dose error;
- result attached to wrong patient/order;
- missed critical result;
- duplicate/amended result mishandled;
- stale copied-forward note;
- wrong timezone/date;
- incorrect unit conversion;
- lost interface message;
- order transmission failure;
- prescription failure;
- consent bypass;
- AI hallucinated fact;
- wrong coding suggestion;
- downtime data loss.

Each hazard has:

- severity;
- likelihood;
- controls;
- test case;
- monitoring;
- owner;
- residual risk acceptance.

---

# 25. Downtime and business continuity

Before production:

- RTO/RPO approved by management and customers where contractual;
- downtime clinical workflow;
- read-only contingency option where feasible;
- paper/alternate procedures for critical workflows;
- lab/result backlog reconciliation;
- prescribing outage procedure;
- claims outage procedure;
- restore runbook;
- communications tree;
- status page/incident communication plan.

Test actual restores; a green backup dashboard is not evidence that restoration works.

---

# 26. Customer onboarding

Required operational checklist:

1. MSA/BAA complete.
2. Customer legal entity/NPI/TIN/location/provider roster captured.
3. Roles/permissions approved.
4. SSO/MFA configured.
5. Payer/clearinghouse enrollments started.
6. eRx prescribers enrolled.
7. Lab interfaces ordered/tested.
8. Imaging interfaces tested if used.
9. Portal domain/branding configured.
10. Patient communication consent/preferences configured.
11. Migration extracts received via approved secure method.
12. Migration reconciliation signed.
13. Training completed.
14. Go-live support plan.
15. Downtime procedure shared.
16. Customer privacy/security contacts recorded.

---

# 27. Migration governance

For every source EHR migration:

- data-export rights confirmed contractually;
- secure transfer method;
- source manifest/hash;
- legal retention responsibility clarified;
- duplicate matching rules approved;
- unmapped terminology reviewed;
- clinical reconciliation;
- financial reconciliation;
- document count/hash check;
- signed cutover plan;
- parallel-run strategy where needed;
- rollback/contingency plan;
- customer signoff.

For eClinicalWorks/Commure or any incumbent, prefer vendor-supported export/FHIR/C-CDA/HL7/EHI export routes and documented PM/RCM exports over unsupported direct database extraction.

---

# 28. Support operations

Define severity levels before go-live.

Example:

- **P1:** patient-safety risk, broad outage, security incident, inability to access critical chart functions.
- **P2:** major workflow degraded without acceptable workaround.
- **P3:** limited defect/workaround exists.
- **P4:** question/enhancement.

For P1 support, define real 24x7 escalation if you contractually promise it. Do not advertise response targets that staffing cannot meet.

Support tooling handling PHI must be BAA-approved and configured to minimize copied PHI.

---

# 29. Pre-pilot go/no-go gate

Do not place live PHI/patients into the system until all applicable boxes are complete.

## Legal/compliance

- [ ] Healthcare counsel reviewed pilot structure.
- [ ] Company/customer MSA signed.
- [ ] BAA signed.
- [ ] AWS BAA active.
- [ ] All PHI subprocessors have required BAAs.
- [ ] HIPAA risk analysis completed with no unaccepted critical risks.
- [ ] Privacy/security policies approved.
- [ ] Incident/breach plan approved.
- [ ] Workforce training complete.
- [ ] Launch-state law matrix complete.

## Security

- [ ] MFA enforced.
- [ ] Tenant-isolation tests passing.
- [ ] Independent penetration test complete; critical/high findings remediated or formally risk-accepted.
- [ ] Central logging/security alerting active.
- [ ] Backups active.
- [ ] Full restore tested.
- [ ] Support JIT access implemented.
- [ ] Secrets management operational.
- [ ] Vulnerability management process operational.

## Clinical

- [ ] Clinical hazard register reviewed.
- [ ] Golden patient safety cases passing.
- [ ] Wrong-patient protections tested.
- [ ] Signed-note amendment behavior validated.
- [ ] Lab correction/critical-result workflows validated.
- [ ] eRx workflow partner-approved if enabled.

## Interoperability

- [ ] FHIR conformance tests for claimed profiles.
- [ ] SMART flow tests.
- [ ] HL7 interfaces tested with actual partners.
- [ ] C-CDA import/reconciliation tested if enabled.
- [ ] Interface downtime/retry/DLQ procedures tested.

## RCM

- [ ] Clearinghouse contract/BAA complete.
- [ ] Payer enrollments complete for pilot payers.
- [ ] Eligibility tested.
- [ ] Test claims/acknowledgments completed.
- [ ] ERA/remittance workflow reconciled.
- [ ] Claim-resubmission logic tested.

## Migration

- [ ] At least two dry runs completed.
- [ ] Reconciliation report reviewed by practice.
- [ ] Documents validated.
- [ ] Active meds/allergies/problems checked.
- [ ] Future appointments checked.
- [ ] Open A/R/claims checked if migrating RCM.
- [ ] Final cutover signoff.

---

# 30. Production go-live gate

- [ ] Pilot criteria met.
- [ ] Named on-call ownership.
- [ ] Status/incident communication channels ready.
- [ ] Customer downtime plan agreed.
- [ ] Production data-retention configuration approved.
- [ ] Patient portal terms/privacy configured.
- [ ] Support access audited.
- [ ] Release rollback/feature flags verified.
- [ ] Performance load test passed at expected peak + safety margin.
- [ ] Export/offboarding capability tested.
- [ ] Security/compliance evidence repository current.

---

# 31. Recurring compliance calendar

| Cadence | Work |
|---|---|
| Continuous | SIEM/security monitoring, vulnerabilities, backups, incident intake |
| Monthly | privileged access, vulnerability remediation, workflow/security metrics |
| Quarterly | access recertification, risk register, vendor/subprocessor changes, restore evidence review |
| Semiannual | tabletop/BCP exercises as company policy dictates; policy spot reviews |
| Annual/material change | formal HIPAA risk analysis refresh, penetration test, policy review, workforce training refresh, vendor review, DR exercise, insurance review |
| Certification calendar | RWT/attestations/surveillance/SVAP and other applicable ONC obligations |

---

# 32. Artifact/evidence repository

Create a controlled compliance repository with:

```text
/Legal
  MSAs/
  BAAs/
  VendorContracts/
/Policies
/Risk
  RiskAnalysis/
  RiskRegister/
/Security
  PenTests/
  VulnerabilityReports/
  AccessReviews/
  RestoreTests/
  IncidentTabletops/
/Vendors
  DueDiligence/
  Subprocessors/
/Training
/Incidents
/ClinicalSafety
/Certification
  CriteriaMatrix/
  TestEvidence/
  RealWorldTesting/
/Migrations
/ReleaseEvidence
```

Evidence matters. A control performed but not documented may be very difficult to prove during a customer audit, breach investigation, certification review, or dispute.

---

# 33. People who must validate specific decisions

| Topic | Validator |
|---|---|
| HIPAA/privacy/state law | Healthcare/privacy attorney + privacy officer |
| HIPAA security risk analysis | Security/compliance lead; independent specialist where useful |
| ONC certification criteria | ONC certification consultant + ATL/ACB |
| EPCS | EPCS vendor + DEA-aware counsel/compliance |
| Coding/claims | Certified coder/biller/RCM specialist |
| Clinical workflows | Practicing clinicians + clinical informatics |
| Lab workflows | Lab interface specialist + clinical users; CLIA counsel if scope expands |
| AI clinical claims | Clinical governance + regulatory counsel/FDA specialist if needed |
| State minor/proxy/sensitive data | Healthcare counsel for each launch state |
| Security testing | Independent penetration-testing firm |

---

# 34. Current authoritative references

## HHS / HIPAA

- HIPAA Security Rule summary: https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- HIPAA Security Rule NPRM: https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html
- HHS regulatory initiatives: https://www.hhs.gov/hipaa/for-professionals/regulatory-initiatives/index.html
- HIPAA for professionals: https://www.hhs.gov/hipaa/for-professionals/index.html

## ASTP/ONC

- HTI-1 Final Rule: https://healthit.gov/regulations/hti-rules/hti-1-final-rule/
- Certification Program: https://healthit.gov/certification-health-it/
- ONC Test Method: https://healthit.gov/certification-health-it/onc-health-it-certification-program-test-method
- §170.315(g)(10): https://isp.healthit.gov/svap-reference-standard/ss-170315g10-standardized-api-patient-and-population-services
- SVAP: https://healthit.gov/certification-health-it/certification-criteria/standards-version-advancement-process-svap/

## Cloud

- AWS HIPAA compliance: https://aws.amazon.com/compliance/hipaa-compliance/
- AWS HIPAA eligible services: https://aws.amazon.com/compliance/hipaa-eligible-services-reference/

## Interoperability

- HL7 FHIR: https://hl7.org/fhir/
- SMART App Launch: https://hl7.org/fhir/smart-app-launch/
- US Core: https://hl7.org/fhir/us/core/

## RCM example

- Stedi healthcare clearinghouse docs: https://www.stedi.com/docs/healthcare

---

# 35. Founder priority order

Before writing thousands of lines of EHR feature code, complete these first:

1. Choose one anchor practice and document every workflow from appointment through claim/payment.
2. Choose the first launch state(s), not “all 50 states.”
3. Decide whether ONC certification is a launch requirement, a near-term requirement, or a later commercial requirement.
4. Engage healthcare counsel/compliance.
5. Lock the BAA-approved cloud/vendor strategy.
6. Build identity, tenancy, authorization, audit, provenance, and data export before flashy AI.
7. Contract/integrate rather than reinvent pharmacy, clearinghouse, lab-network, payment, and communications infrastructure.
8. Build migration tooling early; replacement EHRs live or die on migration.
9. Pilot with real workflows only after risk analysis, security testing, clinical safety testing, vendor enrollments, and migration reconciliation pass.
10. Treat compliance evidence as a product artifact, not an after-the-fact folder created before a sales audit.

