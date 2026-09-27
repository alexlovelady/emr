# clinician-web

Staff-facing chart/schedule web app — the first browser-hosted application in this monorepo. Built
as a thin-but-real golden path: staff login → patient list/search → open a patient's chart
(demographics, active problems/allergies/medications, signed notes, results) → today's schedule.

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
app/api/backend/[...path]         generic proxy for any future client-initiated call
lib/api-proxy.ts                  callBackend() — the one place that calls apps/api
lib/session.ts                    cookie names/options, JWT exp decode (bookkeeping only)
lib/types.ts                      hand-written types matching apps/api's real JSON responses
```

Server Components (the `/patients`, `/patients/[id]`, `/schedule` pages) call `callBackend()`
directly — no extra network hop through the app's own API routes.

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
cannot read patients/charts.

## Known trims (this pass's scope)

- **Patient search is client-side over the full tenant patient list** — `GET /patients` has no
  server-side search/filter parameter today. Fine at pilot-tenant scale; revisit if a tenant's
  patient count grows large enough to make the full-list fetch itself slow.
- **Practitioner names are not resolved on the schedule screen** — `GET /practitioners` requires the
  admin-level `PRACTITIONER_MANAGE` permission, which a plain clinician account won't hold. The
  schedule table shows a truncated practitioner-id badge instead of a name.
- **No frontend automated tests** — no Playwright/Cypress/`@testing-library` precedent exists
  anywhere in this repo yet. This pass was verified manually end-to-end against live seeded data.
  Worth adding Playwright once a second screen-set exists to justify the setup cost.
- **No client-side data-fetching library** (SWR/React Query) — every screen is a Server Component
  doing its own `callBackend()` calls. Fine for a read-only golden path; revisit once a screen needs
  a mutation or client-side revalidation.
