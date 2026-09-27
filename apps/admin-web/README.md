# admin-web

Tenant back-office admin app — organizations, locations, practitioners, and user accounts. Split out
from `apps/clinician-web`'s Phase E ("Do d and e") as a genuinely separate app rather than more nav
entries there: these screens are pure org-wide configuration with zero clinical relevance, unlike
Phase E's reporting half (cohort builder, governed queries, search), which stayed in clinician-web
because clinicians with the right permissions use it daily.

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
lib/api-proxy.ts                  callBackend() — the one place that calls apps/api
lib/session.ts                    cookie names/options, JWT exp decode (bookkeeping only)
lib/types.ts                      hand-written types matching apps/api's real JSON responses
lib/permission-keys.ts            mirrored PERMISSION_KEYS strings for UX-level hide/disable checks
lib/actions/*.ts                  Server Actions — the one place that mutates apps/api
components/providers/permissions-provider.tsx   usePermissions().has(key) — UX gating only
```

No generic `/api/backend/[...path]` proxy route here (unlike clinician-web) — every screen's data is
fetched server-side in its own page component and passed down as props; nothing here needs a
client-side keystroke-driven fetch, so the extra proxy route would be unused.

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

## New backend endpoint added for this app: role assignment

There was no HTTP path anywhere to grant a user a role — only the dev seed script wrote to
`user_roles` directly. Since a "create user" screen without this would produce permanently
locked-out accounts, this pass added two small, real endpoints (not UI-only workarounds), mirroring
the precedent of clinician-web Phase A's additive `GET /auth/permissions`:

- `GET /api/v1/roles` — lists the two seeded system roles (`platform_admin`, `staff`), permission
  `role.manage`. `domains/workforce/src/role/role.repository.ts`.
- `POST /api/v1/users/:id/roles` (body `{roleKey}`) — grants a role, permission `role.manage`,
  cleanly 409s on a duplicate grant rather than leaking a raw unique-violation.

Verified live via curl before any frontend code touched it: created a throwaway user, confirmed zero
effective permissions, granted `staff`, confirmed permissions populated immediately (a fresh DB read,
never cached — same as `/auth/permissions`'s own behavior).

## Known trims

- **No role catalog beyond the two seeded system roles** (`platform_admin`, `staff`) — there's no
  HTTP-exposed way to create a new role or edit a role's permission set; `GET /roles` only lists what
  the dev seed script created. A real multi-role tenant would need a `role` CRUD surface added to
  `domains/workforce` or `domains/tenant` first.
- **No way to see which role(s) a user currently holds** — only `POST .../users/:id/roles` (grant)
  exists; there's no `GET .../users/:id/roles` to list a user's active grants, so the Users table
  can't show a "current role" column. The "Assign role" dialog always starts from the first role in
  the catalog.
- **Practitioner rows don't show their organization** — `PractitionerRow` only carries
  `workforceIdentityId`, not `organizationId` (confirmed from the real backend response shape); the
  practitioner list can't resolve an org name without extra plumbing this pass didn't add.
- **No location address fields** — the `locations` table has no address/city/state/zip columns at
  all (confirmed from the migration), only `name` and `timeZone`; this isn't a UI gap.
- **No update or deactivate for organizations/locations/practitioners** — the backend only exposes
  create + list + get for all three; this app's screens match that (create + read-only table).
- **No frontend automated tests**, same as clinician-web — verified manually end-to-end against live
  seeded data (create an organization → a location in it → a user → a practitioner tied to that user
  and org → assign the user a role → confirmed via `/auth/permissions` that a freshly granted role's
  permissions appear immediately).
