# @ehr/terminology

Phase M (eCW/athena parity roadmap). A small read-only code lookup service (`TerminologyService`),
dispatched by `system`:

- **`ICD-10`** — a one-time bulk load into `terminology_codes`, a global reference-data table (see
  migration `0037_terminology_codes.ts`) from a downloaded CMS flat file — it doesn't ship in this
  repo; it's tens of MB and changes yearly, so it doesn't belong in git.
- **`RxNorm`** — a **live lookup against NLM's free RxNav REST API** (`src/rxnav-client.ts`), not a
  bulk load. No account, no license click-through, no file to download or keep current — chosen
  over the RxNorm full-release flat file (what the plan originally called for) because the UMLS
  download service this file requires an account for turned out to be repeatedly, genuinely
  unreliable (SSO cookie failures, an oversized-header Tomcat crash, "service unavailable"), while
  the plain REST API has no such dependency and needs no data-management step at all.

## Getting the ICD-10-CM data

[CMS's ICD-10 page](https://www.cms.gov/medicare/coding-billing/icd-10-codes) — no account needed.
Download the current year's **"Code Descriptions in Tabular Order"** zip and unzip it; you want
`icd10cm_order_<year>.txt`.

```bash
ICD10CM_ORDER_FILE=/path/to/icd10cm_order_2027.txt pnpm --filter @ehr/terminology run seed
```

Re-running against a newer release safely upserts in place (see `src/load-icd10cm.ts`'s doc
comment). Needs `DATABASE_URL` set (same bootstrap/owner role every other migration/seed script
uses). RxNorm needs no seed step at all — there's nothing to load.

## What's actually loaded vs. looked up live

- **ICD-10-CM** (`system: 'ICD-10'`, matching the `codeSystem` string `domains/clinical`'s
  `ProblemService` already stores): every code in the file, both billable leaf codes and
  non-billable category headers — `validateCode` recognizes both, `searchConcepts` only surfaces
  billable ones (you can't code a header).
- **RxNorm** (`system: 'RxNorm'`, matching `CreateMedicationSchema`'s `rxnormCode` field): each
  `validateCode`/`searchConcepts` call hits RxNav directly, filtered to the 4 prescribable
  clinical-drug term types (SCD/SBD/GPCK/BPCK) — what a prescriber actually selects, not every
  ingredient/brand-name-only/synonym row RxNorm's full data model also contains. A 4-second timeout
  degrades to an honest "couldn't check" rather than hanging a prescribing request.

## `TerminologyService.validateCode`'s `checked` field

`{valid: false}` alone can't distinguish "this code doesn't exist" from "we couldn't check it" (an
unloaded local system, or an unreachable RxNav request) — and the plan is explicit that this must
"warn, don't hard-block," so those two cases must never look the same to a caller. `checked: false`
means the latter: `valid: false` isn't a real signal yet.
