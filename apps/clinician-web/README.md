# clinician-web

Staff-facing clinical + front-office workflow app — the first browser-hosted application in this
monorepo. Started as a thin read-only golden path, then expanded into a real daily-use tool across
five passes:

- **Phase A**: scheduling (book/confirm/check-in/cancel), encounter + note authoring with sign-off,
  problem/allergy/medication management, orders + results review, e-prescribing (incl. controlled
  substances + refills), a "My Tasks" inbox.
- **Phase B**: patient registration (with a live duplicate-check + merge), insurance coverage +
  external identifiers, intake form templates + patient-assigned responses, staff↔patient messaging,
  document upload/download.
- **Phase C**: billing/RCM — charge capture + a tenant-wide coding queue, claims (create/submit/
  timeline), denial resolution, eligibility checks, patient ledger.
- **Phase D**: `domains/ai`'s propose→human-review AI features surfaced in the UI — ambient note
  draft, encounter summary, chart Q&A, patient-message draft-reply, coding suggestions, denial
  explanation, task summarization — all through one generic review component
  (`components/ai/ai-generation-review.tsx`).
- **Phase E (reporting half)**: a cohort builder (manual condition-row builder + an "ask in plain
  English" AI-assisted mode), saved-cohort execution history + CSV export, governed queries, and a
  global search box. The admin half of Phase E (organizations/locations/practitioners/users) lives
  in the new `apps/admin-web`, not here — see its own README.

See the plan history for the full multi-phase roadmap toward eClinicalWorks/athenahealth feature
parity — this app now covers Phases A–D plus Phase E's reporting half. The patient chart has 10 tabs:
Problems, Medications, Allergies, Results, Notes, Coverage, Intake, Messages, Documents, Billing.

Next.js 15 (App Router) + React 19 + TypeScript, shadcn/Radix UI primitives (hand-copied into
`components/ui`, not an installed package) + Tailwind CSS, per `EHR_BUILD_SPEC.md` §2.1.

## Architecture

`apps/clinician-web` is a **Backend-for-Frontend (BFF)**: the browser never calls `apps/api`
directly. All backend calls happen server-side, inside this app's own Next.js server, using
`httpOnly` cookies for the session — see [`docs/adr/0006-clinician-web-bff-auth.md`](../../docs/adr/0006-clinician-web-bff-auth.md)
for the full rationale.

```
middleware.ts                     proactively refreshes the session before any page runs
app/api/login, app/api/logout     set/clear the httpOnly session cookies
app/api/mfa-challenge             completes an MFA login challenge, then sets the same cookies
app/api/backend/[...path]         generic proxy for any client-initiated call (e.g. eRx typeahead)
lib/api-proxy.ts                  callBackend() — the one place that calls apps/api
lib/session.ts                    cookie names/options, JWT exp decode (bookkeeping only)
lib/types.ts                      hand-written types matching apps/api's real JSON responses
lib/permission-keys.ts            mirrored PERMISSION_KEYS strings for UX-level hide/disable checks
lib/actions/*.ts                  Server Actions — the one place that mutates apps/api
lib/use-close-on-success.ts       shared "close this dialog once its action succeeds" hook
components/providers/permissions-provider.tsx   usePermissions().has(key) — UX gating only
```

Server Components call `callBackend()` directly — no extra network hop through the app's own API
routes. Mutations go through `'use server'` Server Actions in `lib/actions/`, each wrapped in
`runAction()` (`lib/actions/action-result.ts`) for a uniform `{ok, data} | {ok, error}` result, and
each calling `revalidatePath()` on success. Every mutation button/nav-entry is additionally gated
client-side by `usePermissions().has(...)` against `GET /api/v1/auth/permissions` (added this pass,
`apps/api/src/auth/auth.controller.ts` — a fresh DB read every call, never cached or embedded in the
JWT) — UX only, the Server Action's target endpoint remains the real authorization boundary.

**MFA (real TOTP, added this pass):** `/login` is a two-step form — credentials first, then (only if
`POST /api/login` returns `{mfaRequired: true, mfaPendingToken}`) a 6-digit authenticator code
submitted to `/api/mfa-challenge`. Users self-enroll at `/settings/security`
(`components/settings/mfa-enroll.tsx`), which renders the backend's `otpauthUrl` as a QR code
client-side via the `qrcode` package. **Gotcha hit and fixed:** `middleware.ts`'s `PUBLIC_PATHS` must
include `/api/mfa-challenge` — that request happens before any real session cookie exists (that's the
whole point of the pending-token step), so without this the middleware redirected it straight back to
`/login`, discarding the code before it ever reached the route handler. Caught via a real browser
click-through, not typecheck/lint/build (all three passed while this bug was live).

## Running locally

Requires `apps/api` running and reachable (defaults to `http://localhost:3000`; override with the
`API_INTERNAL_URL` env var — server-only, never exposed to the browser).

```bash
pnpm --filter @ehr/api run dev          # in one terminal
pnpm --filter @ehr/clinician-web run dev  # serves http://localhost:3010
```

Seeded dev credentials (see `packages/db/src/seed-fixtures.ts`): tenant slug `tenant-a`, email
`admin@tenant-a.test`, password `Dev-Passw0rd!`. **Use the admin account, not `staff@tenant-a.test`**
— the seeded "Staff" role is deliberately minimal (`document.upload`/`document.download` only) and
cannot read patients/charts. There is no seeded "Clinician" role with a realistic narrower
permission set yet — every permission-gated button in this app is exercised via the admin account,
which holds all 49 permission keys.

**Note on `next build` + `next dev`/`typecheck`/`lint` sharing `.next`**: running more than one of
these concurrently for this app races over the same `.next` directory and can corrupt it (a stray
`<Html> should not be imported outside of pages/_document` error, or `tsc` failing to find
`.next/types/**`) — this is a Next.js/Turbo tooling quirk, not an app bug; each check passes cleanly
run alone. Run them sequentially, or `rm -rf .next` between a `build` and a subsequent `dev`.

## Known trims (from the golden-path pass, still true)

- **Patient search is client-side over the full tenant patient list** — `GET /patients` has no
  server-side search/filter parameter today. Fine at pilot-tenant scale; revisit if a tenant's
  patient count grows large enough to make the full-list fetch itself slow.
- **Practitioner and location names are not resolved anywhere** — `GET /practitioners` and
  `GET /locations` both require admin-level permissions (`PRACTITIONER_MANAGE`/`LOCATION_MANAGE`) a
  plain clinician account won't hold. The schedule table shows a truncated practitioner-id badge
  instead of a name, and the new-appointment/place-order/prescribe forms take a plain practitioner/
  location UUID text input instead of a picker.
- **No frontend automated tests** — no Playwright/Cypress/`@testing-library` precedent exists
  anywhere in this repo yet. Verified manually end-to-end against live seeded data, including every
  Phase A write path. Worth adding Playwright now that there's a real workflow surface to justify it.

## Known trims (new this pass — Phase A)

- **No "list pending refill requests" endpoint exists server-side** — `RefillRequest` rows can be
  created (`POST /prescriptions/:id/refill-requests`) and approved/denied by id, but nothing lists
  them, so there's no UI to browse pending refills and approve/deny by clicking one. The medications
  panel only offers "Request refill" per prescription; approve/deny would need a new backend list
  endpoint first.
- **Allergies have no update/resolve endpoint** — create + list only, server-side. No "mark allergy
  resolved" UI exists, deliberately, since there's nothing to call.
- **No reassign-task endpoint** — a task's `assignedToUserId`/`assignedToRoleId` is set once at
  creation; there's no UI action to reassign an existing task.
- **No reschedule-appointment endpoint** — rescheduling means cancel + book a new appointment; there
  is no in-place "move this appointment" action.
- **The Results tab and encounter-workspace "Record result"/"Place order" are separate surfaces** —
  recording a result or placing an order requires an `encounterId`, so those actions live in the
  encounter workspace (`/encounters/[id]`); reviewing a result (`RESULT_REVIEW`) doesn't need an open
  encounter, so that action lives directly on the patient chart's Results tab and in the standalone
  `/results-inbox` screen.
- **No client-side data-fetching library** (SWR/React Query) — reads are plain Server Component
  `callBackend()` calls; writes are Server Actions with `revalidatePath()`. No optimistic UI/
  client-side cache exists yet — every mutation waits for the server round-trip before the UI
  updates.

## Known trims (new this pass — Phases B & C)

- **Phase C (billing/RCM) stays inside this app, not a separate `apps/admin-web`** — a deliberate
  scope decision, not a gap; see the plan history for the reasoning. Every billing screen is
  permission-gated the same way as everything else in this app.
- **No "list denials by patient" endpoint exists** — the patient chart's Billing tab derives its
  denial list by fetching every one of the patient's claims' timelines (`GET /claims/:id/timeline`)
  and flattening their `denials` arrays, since there's no direct patient-scoped denials endpoint.
- **Eligibility checks and claim submission hit a fixed stub** (`NoopClearinghouseGateway`) — the
  "Run eligibility check" dialog says so explicitly in its own copy; a real payer/clearinghouse
  connection would replace this without any UI change.
- **The patient ledger only ever decreases** — `LedgerService.postEntry()` is only ever called from
  remittance posting (an async, webhook-gateway-only path not reachable from this UI in the current
  dev environment); nothing in this pass's write paths posts a positive `charge`-type ledger entry.
  Real charge amounts are visible in the Charges section; the Ledger section reflects only posted
  payments/adjustments.
- **Document upload/download was not live-tested end-to-end** — this dev environment has no running
  MinIO/S3 instance (a pre-existing, already-documented constraint of this whole project — see the
  root README). The presigned-URL request against `apps/api` was verified live (`POST /documents`
  returns a real, correctly-shaped presigned PUT URL); the actual PUT to storage was verified to fail
  cleanly with a clear error (`app/api/documents/route.ts` catches the network failure and returns a
  502 with a readable message) rather than crashing, but a real upload→confirm→download round trip
  needs a running object-storage backend to test.
- **No reassign-refill-approver UI, no reverse-merge UI** — same "no endpoint reachable" reasoning as
  other trims above; both exist as real backend actions (`POST .../merges/:id/reverse`) but weren't
  wired into this pass's screens.
- Building this pass surfaced and fixed two real, pre-existing gaps as they were hit live: (1)
  `EncounterService.create()` let a Postgres unique-constraint violation (double-creating an
  encounter for an already-started appointment) leak as a raw, unhandled 500 instead of a clean
  `ConflictError` — fixed with an explicit pre-check; (2) a chart-tab `ClaimRow` nested a real
  `<button>` (Submit) inside its own toggle `<button>`, invalid HTML that caused a React hydration
  error — fixed by making the row's toggle target a `div[role=button]` instead.

## Known trims (new this pass — Phase D & Phase E's reporting half)

- **One generic AI review component for all 7 features used here** (`components/ai/
  ai-generation-review.tsx` + `ai-propose-trigger.tsx`) — `NoopAiGateway` always returns a single
  plain `outputText` string regardless of feature, so there's no per-feature structured UI (e.g. no
  coding-suggestion list widget with individual accept/reject per code). If a real LLM vendor is ever
  connected and starts returning structured `outputJson` per feature, this UI would need per-feature
  rendering to take advantage of it.
- **Accepting an AI draft never auto-fills the target field except where explicitly wired** — note
  draft (into the first content section of the open note) and message draft-reply (into the reply
  box) prefill client-side; chart Q&A, coding suggestions, denial summaries, and task summaries are
  reference-only text a human reads and acts on manually, matching the "accept never mutates another
  domain" rule in `docs/adr/0004-deferred-ai-vendor.md`.
- **The NL-to-cohort-DSL feature always returns the same canned DSL** (a 45–75 age range + active
  E11 diabetes condition) regardless of the question asked, since `NoopAiGateway` doesn't do any real
  NL parsing — the UI discloses this directly rather than presenting it as a working assistant.
- **The cohort builder is a small, closed vocabulary, not a general query tool** — only `age` (a
  field), `condition`/`allergy`/`medication` (concepts), and `latest_hba1c`/
  `days_since_completed_encounter` (measures), combined with implicit AND only (no OR, no nesting) —
  this mirrors `@ehr/query`'s actual `CohortDslSchema` exactly, not a UI limitation layered on top of
  a richer backend.
- **Global search covers only 3 of the spec's 7 resource types** (Patient, Document, Claim) — the
  only ones `domains/query/src/search`'s reindexer actually populates today; encounter notes,
  labs/results, tasks/referrals, and providers/locations aren't searchable yet.
- **Governed queries' param forms are hand-coded per query name**, not generated from a schema — the
  `GET /governed-queries` list endpoint doesn't expose each query's parameter shape, so
  `components/reports/governed-queries-panel.tsx` has one hardcoded form per the 3 queries that exist
  server-side today. A 4th governed query added later would need a matching new form here.

**Two real, shared bugs found while building `apps/patient-portal` (Phase F) — fixed here too, since
`lib/api-proxy.ts`/`lib/actions/action-result.ts` are the same hand-copied code in all three web
apps:**
1. **`callBackend()` only special-cased HTTP 204 as "empty body"** — a `Promise<void>` NestJS handler
   with no explicit `@HttpCode(204)` sends its default status (e.g. 201) with a genuinely empty body,
   and `res.json()` throws `SyntaxError: Unexpected end of JSON input` on empty text. Fixed by reading
   the response as text first and only parsing it as JSON if non-empty, regardless of status code.
2. **`runAction()`'s error fallback (`err.problem?.title ?? err.message`) let an empty string through**
   — the backend's generic exception filter returns `title: ""` for an unhandled non-HTTP error (e.g.
   this dev environment's documented no-MinIO `ECONNREFUSED`), and `??` only falls back on
   null/undefined, not `""`, so the UI rendered a blank `<Alert>`. Fixed with `||` instead, plus a
   final generic fallback string.
