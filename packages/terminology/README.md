# @ehr/terminology

Phase M (eCW/athena parity roadmap). A small read-only lookup service (`TerminologyService`) over
`terminology_codes`, a global reference-data table (see migration `0037_terminology_codes.ts`)
loaded once from two downloaded government/NLM flat files — **neither ships in this repo**; they're
tens of MB and change monthly, so they don't belong in git.

## Getting the data

1. **ICD-10-CM**: [CMS's ICD-10 page](https://www.cms.gov/medicare/coding-billing/icd-10-codes) —
   no account needed. Download the current year's **"Code Descriptions in Tabular Order"** zip and
   unzip it; you want `icd10cm_order_<year>.txt`.
2. **RxNorm**: requires a free [UMLS Terminology Services](https://uts.nlm.nih.gov/uts/) account
   (a one-time license click-through, not a purchase). Download → RxNorm → the **RxNorm Full
   Monthly Release** zip; you want `rrf/RXNCONSO.RRF` from inside it.

## Loading

```bash
ICD10CM_ORDER_FILE=/path/to/icd10cm_order_2027.txt \
RXNORM_RRF_FILE=/path/to/RXNCONSO.RRF \
pnpm --filter @ehr/terminology run seed
```

Either variable can be omitted — each file loads independently, and re-running against a newer
release safely upserts in place (see `src/load-icd10cm.ts`/`src/load-rxnorm.ts`'s doc comments).
Needs `DATABASE_URL` set (same bootstrap/owner role every other migration/seed script uses).

## What's actually loaded

- **ICD-10-CM** (`system: 'ICD-10'`, matching the `codeSystem` string `domains/clinical`'s
  `ProblemService` already stores): every code in the file, both billable leaf codes and
  non-billable category headers — `validateCode` recognizes both, `searchConcepts` only surfaces
  billable ones (you can't code a header).
- **RxNorm** (`system: 'RxNorm'`, matching `CreateMedicationSchema`'s `rxnormCode` field): only the
  4 prescribable clinical-drug term types (SCD/SBD/GPCK/BPCK) — one preferred name per concept, not
  every synonym/ingredient/brand-name-only row RXNCONSO.RRF also contains.

## `TerminologyService.validateCode`'s `checked` field

`{valid: false}` alone can't distinguish "this code doesn't exist" from "we haven't loaded this
code system yet" — and the plan is explicit that this must "warn, don't hard-block," so those two
cases must never look the same to a caller. `checked: false` means the latter: nothing for that
`system` has been loaded at all, so `valid: false` isn't a real signal yet.
