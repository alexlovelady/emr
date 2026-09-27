# admin-web

Tenant back-office admin app — organizations, locations, practitioners, users, and roles. Split out
from `apps/clinician-web`'s Phase E ("Do d and e") as a genuinely separate app rather than more nav
entries there: these screens are pure org-wide configuration with zero clinical relevance, unlike
Phase E's reporting half (cohort builder, governed queries, search), which stayed in clinician-web
because clinicians with the right permissions use it daily. Extended in the eCW/athenahealth parity
roadmap's Phase G with role catalog management, multi-location practitioner assignment, and
update/deactivate for every entity that previously only supported create + list.

Next.js 15 (App Router) + React 19 + TypeScript, shadcn/Radix UI primitives (hand-copied into
`components/ui`, same as clinician-web) + Tailwind CSS.

## Architecture

Same **BFF** pattern as `apps/clinician-web`, reusing its plumbing wholesale rather than reinventing
it — the browser never calls `apps/api` directly; all backend calls happen server-side using
`httpOnly` cookies. See [`docs/adr/0006-clinician-web-bff-auth.md`](../../docs/adr/0006-clinician-web-bff-auth.md)
(written for clinician-web, applies here unchanged).

```
middleware.ts                     proactively refreshes the session before any page runs
app/api/login, app/api/logout     set/clear the httpOnly session cookies
app/api/mfa-challenge             completes an MFA login challenge, then sets the same cookies
lib/api-proxy.ts                  callBackend() — the one place that calls apps/api
lib/session.ts                    cookie names/options, JWT exp decode (bookkeeping only)
lib/types.ts                      hand-written types matching apps/api's real JSON responses
lib/permission-keys.ts            mirrored PERMISSION_KEYS strings for UX-level hide/disable checks
lib/permission-catalog.ts         the FULL PERMISSION_KEYS catalog, for the Roles screen's checklist
lib/actions/*.ts                  Server Actions — the one place that mutates apps/api
components/providers/permissions-provider.tsx   usePermissions().has(key) — UX gating only
```

No generic `/api/backend/[...path]` proxy route here (unlike clinician-web/patient-portal) — every
screen's data is fetched server-side in its own page component and passed down as props; nothing
here needs a client-side keystroke-driven fetch, so the extra proxy route would be unused.

**MFA (real TOTP, added this pass):** same two-step `/login` + `/settings/security` enrollment flow
as clinician-web (`components/settings/mfa-enroll.tsx`), same `qrcode`-rendered QR code. Same
`middleware.ts` `PUBLIC_PATHS` gotcha applies here too — `/api/mfa-challenge` must stay in that list
or the pre-session MFA-code request gets redirected to `/login` before it reaches the route handler.

## Running locally

Requires `apps/api` running and reachable (defaults to `http://localhost:3000`; override with the
`API_INTERNAL_URL` env var).

```bash
pnpm --filter @ehr/api run dev         # in one terminal
pnpm --filter @ehr/admin-web run dev   # serves http://localhost:3020
```

Seeded dev credentials (see `packages/db/src/seed-fixtures.ts`): tenant slug `tenant-a`, email
`admin@tenant-a.test`, password `Dev-Passw0rd!` — the only seeded role with `organization.manage`/
`location.manage`/`practitioner.manage`/`user.manage`/`role.manage`.

**Note on `next build` + `next dev`/`typecheck`/`lint` sharing `.next`**: same Next.js/Turbo tooling
quirk as clinician-web — run these sequentially, or `rm -rf .next` between a `build` and a subsequent
`dev`.

## New backend work added for this app

**Phase G (role catalog + multi-location assignment + update/deactivate) — all closing gaps this
README previously listed as "Known trims":**

- `GET /api/v1/users/:id/roles` — lists a user's active role grants, joined with each role's
  `key`/`displayName` (`domains/workforce/src/role/role.repository.ts`'s new
  `listActiveGrantsForUser`). Previously only `POST` (grant) existed; the Users table now shows real
  role badges instead of nothing.
- `POST /api/v1/roles` + `POST/GET /api/v1/roles/:id/permissions` + `POST .../permissions/revoke` —
  a real role catalog, not just the two seeded system roles. Permission grants are validated against
  the actual `PERMISSION_KEYS` catalog server-side (`ValidationError` on an unknown key) — the Roles
  screen's 49-checkbox grid is a mirror of that same catalog (`lib/permission-catalog.ts`), not a
  separate source of truth.
- `PATCH` + `POST .../deactivate` for organizations, locations, and practitioners — all three
  previously supported create + list + get only.
- `POST/GET /api/v1/practitioners/:id/location-roles` — a new `practitioner-role` module exposing the
  `practitioner_roles` table, which existed in the schema since the very first migration but had zero
  HTTP surface until this pass (confirmed via repo-wide grep). This is the real structural link between
  a practitioner and a specific location + role, and the "Assign location" action on the Practitioners
  screen is its first-ever UI.
- `packages/db/migrations/0033_location_address.ts` — `locations` genuinely had no address columns at
  all before this pass; added `address_line1/2, city, state, postal_code`, all nullable.
- `PractitionerRepository` now joins `workforce_identities` to resolve `organizationId` directly on
  every practitioner row, so the Practitioners table shows a real organization name instead of nothing.

Every one of these was curl-verified end-to-end before any frontend code touched it (create/read/
update/deactivate + duplicate-grant 409 + invalid-permission-key 422), following the same
verify-the-endpoint-first discipline as clinician-web's `/auth/permissions` and this app's original
role-assignment endpoint.

## Known trims

- **The Users table's role badges are N+1 fetches** — there's no bulk "roles for these users" endpoint,
  so the page does one `GET /users/:id/roles` per user via `Promise.all`. Fine at pilot-tenant scale
  (dozens of users); would need a real batched endpoint at real scale.
- **No pagination anywhere** — Organizations/Locations/Practitioners/Users all render their full list;
  acceptable for a single-tenant admin tool today, a real gap if a tenant's practitioner count grows
  large (the dev seed data alone has 170+ from repeated test runs).
- **No UI to revoke a practitioner's location-role assignment** — `POST .../location-roles` (create)
  and `GET` (list) exist; there's no revoke endpoint or button, matching the "build what the backend
  actually supports" precedent elsewhere in this codebase.
- **No way to edit an existing role's key or display name**, only its permission set — `roles.key` is
  effectively immutable once created (no update endpoint was added, since role keys are referenced by
  the seed's `SYSTEM_ROLE_KEYS` and changing one out from under existing code would be a real footgun).
- **A deactivated location doesn't cascade** — deactivating a location doesn't automatically revoke
  practitioner-role assignments pointing at it; those stay `active` and orphaned in the UI.
