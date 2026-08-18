FROM docker.io/oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune @larity/workers --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
WORKDIR /app/packages/db
RUN bunx prisma generate

FROM base AS release
ENV NODE_ENV=production
# Upgrade base image packages to pick up security fixes (openssl, util-linux, etc.)
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
# Production standard: install in the final stage so node_modules is complete
# and correctly linked (no cross-stage COPY of bun's store/symlinks). Uses
# hoisted linker (bunfig.toml) so @prisma/client resolves from /app/node_modules.
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
COPY --from=pruner /app/out/full/ .
RUN bun install --frozen-lockfile --ignore-scripts --production
WORKDIR /app/packages/db
RUN bunx prisma generate
WORKDIR /app
EXPOSE 8080
USER bun
ENTRYPOINT [ "bun", "run", "apps/workers/index.ts" ]
