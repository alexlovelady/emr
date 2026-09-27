# ADR-0006: `apps/clinician-web` as a BFF with httpOnly-cookie sessions

## Status

Accepted — 2026-09-26

## Context

`apps/clinician-web` is the first browser-hosted application in this monorepo — the first React,
first Next.js, first DOM-targeting TypeScript config anywhere in the repo. It needs a way to call
`apps/api` from the browser. `apps/api` today has **zero CORS configuration** anywhere in its
Fastify/Nest bootstrap, and every existing client of it (test suites, `curl`, the future SMART/FHIR
clients) is a same-process or server-to-server caller — none of them are a browser page on a
different origin (`localhost:3010` vs `localhost:3000` in dev; separate subdomains in any real
deployment).

Two ways to make a browser-hosted app talk to `apps/api`:

1. Enable CORS on `apps/api` for `clinician-web`'s origin, and have the browser hold the access/
   refresh tokens directly (`localStorage` or a non-`httpOnly` cookie) and attach
   `Authorization: Bearer` headers itself.
2. Make `apps/clinician-web`'s own Next.js server a Backend-for-Frontend (BFF): the browser never
   talks to `apps/api` directly, only to Next's own server (Route Handlers, Server Components,
   Middleware), which in turn calls `apps/api` server-to-server.

## Decision

**BFF with httpOnly cookies (option 2).** All calls to `apps/api` happen server-side, inside
`apps/clinician-web`'s own Next.js process — server-to-server calls are never subject to CORS at
all, so `apps/api` needs zero changes for this decision. Access and refresh tokens are stored in
`httpOnly`, `secure` (prod only), `sameSite: 'strict'` cookies set by Next's server on login
(`app/api/login/route.ts`); client-side JavaScript never holds a raw bearer token.

- `middleware.ts` runs on every request to a protected route. It decodes (not verifies — `apps/api`
  still verifies the real signature on every call; this is bookkeeping only) the access token's
  `exp` claim and proactively refreshes — calling `apps/api`'s real `POST /auth/refresh` and writing
  fresh `Set-Cookie` headers — before any Server Component or Route Handler runs. This matters
  because Server Components cannot set cookies themselves in Next.js (`cookies().set()` throws
  outside a Route Handler/Server Action/Middleware), so token staleness must never be discovered
  *during* server-side rendering.
- `lib/api-proxy.ts`'s `callBackend()` is the single fetch implementation, used by both Server
  Components (direct, in-process call — no self-hosted network hop) and the generic
  `app/api/backend/[...path]/route.ts` proxy (for any future client-initiated write). It retries
  once on a **403** — confirmed `apps/api`'s `requireCtx()` throws `ForbiddenError` → 403 for a
  missing/invalid actor, never 401, via `ProblemDetailsFilter`'s `DomainError.httpStatus` mapping —
  as defense-in-depth alongside middleware's proactive refresh. Because a 403 in this codebase is
  also returned for a genuine permission-denial (`RequirePermission`/`PolicyEngine`), not only for
  an expired/invalid token, this retry is a heuristic, not a guarantee — see Consequences.
- One new env var, `API_INTERNAL_URL` (server-only, never `NEXT_PUBLIC_`-prefixed), added to
  `turbo.json`'s `globalEnv`.

## Consequences

- Meaningfully reduces XSS-token-theft surface for a healthcare application: even a successful
  script injection in `clinician-web` cannot read the access/refresh tokens, since they are never
  exposed to `document.cookie` or any client-readable storage. Manually confirmed in this pass
  (`document.cookie` shows no `ehr_access_token`/`ehr_refresh_token` after login).
- Smallest possible diff to `apps/api`: no CORS middleware, no new headers, nothing. The entire
  auth-transport decision lives inside `apps/clinician-web`.
- `callBackend()`'s retry-on-403 cannot distinguish "token expired" from "user genuinely lacks this
  permission" — both surface as HTTP 403 from `apps/api` with different `ProblemDetails` bodies. A
  permission-denied 403 costs one wasted refresh round-trip before the real `BackendError` (with the
  actual denial detail) is thrown; it does not cause an incorrect redirect to `/login`, since
  `SessionExpiredError` is only thrown when the refresh call itself fails. Found and reproduced
  during this pass's verification when the seeded `staff@tenant-a.test` account (deliberately
  minimal permissions — `document.upload`/`document.download` only, per
  `packages/db/src/seed-fixtures.ts`) hit a real `patient.read.demographics` 403.
- When `callBackend()`'s retry runs from a Server Component (not a Route Handler), the refreshed
  tokens are used for that request's retry but **cannot be persisted** to cookies (`cookies().set()`
  throws there — caught and ignored). This is safe (middleware already refreshed proactively for
  the common case; this path only fires on the rarer 403-after-middleware-passed case) but means a
  Server-Component-triggered refresh is not durably saved until the next middleware pass.
- Every protected Server Component does its own parallel `callBackend()` calls (e.g. the patient
  chart page fetches patient/problems/allergies/medications/notes/results in one `Promise.all`) —
  no client-side data-fetching library (SWR/React Query) exists yet. Fine at this screen count;
  revisit if a future screen needs client-side revalidation/mutation beyond what Server Actions
  cover.

## Alternatives considered

- **Enable CORS + browser-held tokens.** Rejected: requires `apps/api` changes (new CORS
  middleware, `Access-Control-*` handling) for a security posture strictly worse for a healthcare
  app — any XSS in `clinician-web` would be able to read and exfiltrate a live bearer token. Also
  the larger diff of the two options, touching a shared package instead of only the new app.
- **Direct browser calls with a non-`httpOnly`, `sameSite` cookie apps/api reads itself.** Rejected
  for the same XSS-exposure reason as above, and `apps/api` has no cookie-parsing/CSRF-protection
  layer today — building one just for this would be more invasive than the BFF's zero-`apps/api`-
  change footprint.
- **Reactive-only token refresh (skip middleware's proactive check, rely solely on 403-retry).**
  Rejected: Server Components cannot set cookies, so a refresh discovered only during SSR cannot be
  persisted for the next request without an extra client-side round-trip; proactively refreshing in
  Middleware (which *can* set cookies) before SSR starts avoids that class of problem entirely for
  the common case.
