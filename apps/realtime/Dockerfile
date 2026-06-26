FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: PRUNE
# ────────────────────────────────────────────────────────────────────────────
FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune @larity/realtime --docker

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: BUILDER (dev + prod deps)
# We run `bun install` and then `COPY out/full` IN THE SAME STAGE.
# This prevents Docker from dropping the nested node_modules folders
# (e.g. /app/packages/infra/node_modules) created by `bun install`.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

WORKDIR /app/packages/infra
RUN bunx prisma generate

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: PROD-INSTALL (production deps only)
# ────────────────────────────────────────────────────────────────────────────
FROM base AS prod-install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 4: RELEASE
# ────────────────────────────────────────────────────────────────────────────
FROM base AS release
ENV NODE_ENV=production

# Copy ALL node_modules (root and nested workspaces) from prod-install
COPY --from=prod-install /app /app

# Copy the pruned source code (since realtime runs raw TS)
COPY --from=pruner /app/out/full/ /app

# Overwrite infra with the one that has the generated prisma client
COPY --from=builder /app/packages/infra/prisma/generated /app/packages/infra/prisma/generated

WORKDIR /app
EXPOSE 9001
USER bun
ENTRYPOINT [ "bun", "run", "apps/realtime/src/index.ts" ]
