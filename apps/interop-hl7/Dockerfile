# Multi-stage build using Turborepo's `prune` so the final image only carries
# @ehr/interop-hl7 and the workspace packages it actually depends on (ADR-0001: Railway
# hosting needs an explicit Dockerfile — its Nixpacks auto-detection is unreliable
# for a pnpm+Turborepo monorepo with multiple deployables).
#
# Build from the REPO ROOT: docker build -f apps/interop-hl7/Dockerfile .

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.4 prune @ehr/interop-hl7 --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@ehr/interop-hl7

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 ehr && adduser --system --uid 1001 ehr
COPY --from=installer --chown=ehr:ehr /app .
USER ehr

ENV NODE_ENV=production
EXPOSE 3300
CMD ["node", "apps/interop-hl7/dist/main.js"]
