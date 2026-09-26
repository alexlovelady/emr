# Deploying to Railway (manual — no CI automation yet)

Per [ADR-0001](../adr/0001-railway-hosting.md), Phase 1 hosts on Railway instead of AWS.
This is a manual process for now; CI's `docker-build` job only builds and scans the images,
it does not deploy them (see `.github/workflows/ci.yml`).

## One-time project setup

1. Create a Railway project.
2. Add a **Postgres** plugin. Copy its connection string — this becomes `DATABASE_URL` (the
   bootstrap/owner role migrations and seeds use).
3. Add a **Redis** plugin. Copy its connection string as `REDIS_URL`.
4. Provision object storage — Railway has no native equivalent, so use **Cloudflare R2**
   (see ADR-0001): create a bucket and an API token, and set `OBJECT_STORAGE_ENDPOINT`,
   `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`
   accordingly (`OBJECT_STORAGE_FORCE_PATH_STYLE=false` for R2, `OBJECT_STORAGE_REGION=auto`).
5. Create two Railway services, both building from this repo:
   - **api** — Dockerfile path `apps/api/Dockerfile`, build context repo root.
   - **worker** — Dockerfile path `apps/worker/Dockerfile`, build context repo root.

## Environment variables (both services, unless noted)

See `.env.example` for the full list. At minimum:

```
DATABASE_URL=<Railway Postgres connection string>
APP_DATABASE_URL=postgres://ehr_app:<EHR_APP_DB_PASSWORD>@<same host/port/db as above>
EHR_APP_DB_PASSWORD=<generate a strong password — used once, by the migration that creates ehr_app>
REDIS_URL=<Railway Redis connection string>
OBJECT_STORAGE_ENDPOINT=<R2 endpoint>
OBJECT_STORAGE_BUCKET=<R2 bucket name>
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ACCESS_KEY_ID=<R2 access key>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<R2 secret key>
OBJECT_STORAGE_FORCE_PATH_STYLE=false
JWT_ISSUER=ehr-<environment>
JWT_AUDIENCE=ehr-api
NODE_ENV=production
PORT=3000       # api only
WORKER_PORT=3100  # worker only
```

`JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH` should NOT use the `./.dev/...` auto-generate
path in any real deployment — provision real keys and mount/inject them, or extend
`packages/auth-adapter`'s `loadOrCreateKeyMaterial` to read from a secrets manager before this
goes anywhere near real users. This is a known gap — see ADR-0002.

## First deploy

1. Push both services; let the initial build fail or idle (no migrations run yet).
2. Run the migrator once, against the same `DATABASE_URL`, from your machine or a Railway
   one-off shell:
   ```bash
   pnpm --filter @ehr/db migrate:latest
   ```
3. (Optional, non-production) seed synthetic fixtures:
   ```bash
   pnpm --filter @ehr/db seed
   ```
4. Redeploy both services so they pick up the now-migrated schema.
5. Verify: `curl https://<api-service>/healthz` and `curl https://<worker-service>/healthz`.

## Notes

- Do not point `DATABASE_URL`/`APP_DATABASE_URL` at a database that could ever contain real
  PHI until the Phase 0 gates in `EHR_REGULATORY_MANUAL.md` §29 are met and ADR-0001's AWS
  migration has happened — this Railway setup is for pre-PHI development/staging only.
- `apps/worker` has no HTTP traffic other than `/healthz` — Railway's health check should point
  at that path, not the root.
