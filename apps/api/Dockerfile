# Multi-stage build using Turborepo's `prune` so the final image only carries
# @ehr/api and the workspace packages it actually depends on (ADR-0001: Railway
# hosting needs an explicit Dockerfile — its Nixpacks auto-detection is unreliable
# for a pnpm+Turborepo monorepo with multiple deployables).
#
# Build from the REPO ROOT: docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.4 prune @ehr/api --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@ehr/api

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 ehr && adduser --system --uid 1001 ehr
COPY --from=installer --chown=ehr:ehr /app .
USER ehr

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
