# clinician-web

Staff-facing clinical workflow app — the first browser-hosted application in this monorepo. Started
as a thin read-only golden path, then expanded ("Phase A") into a real daily-use tool: patient
registry, scheduling (book/confirm/check-in/cancel), encounter + note authoring with sign-off,
problem/allergy/medication management, orders + results review, e-prescribing (incl. controlled
substances + refills), and a "My Tasks" inbox. See the plan history for the full multi-phase
roadmap toward eClinicalWorks/athenahealth feature parity — this app covers Phase A.

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
