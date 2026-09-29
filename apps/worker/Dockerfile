# Same turbo-prune pattern as apps/api/Dockerfile — see its comments for rationale.
# Build from the REPO ROOT: docker build -f apps/worker/Dockerfile .

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.4 prune @ehr/worker --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@ehr/worker

FROM base AS runner
WORKDIR /app
# postgresql-client provides pg_dump — packages/db-backup shells out to it (see that package's own
# doc comments for why a real binary is used instead of a pure-JS reimplementation). Version-matched
# to the postgres:16-alpine server image used everywhere else in this repo (docker-compose.yml,
# .github/workflows/ci.yml).
RUN apk add --no-cache postgresql16-client
RUN addgroup --system --gid 1001 ehr && adduser --system --uid 1001 ehr
COPY --from=installer --chown=ehr:ehr /app .
USER ehr

ENV NODE_ENV=production
EXPOSE 3100
CMD ["node", "apps/worker/dist/main.js"]
