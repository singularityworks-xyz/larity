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
RUN turbo prune control --docker

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

# Generate Prisma client (now successfully finds @prisma/config)
WORKDIR /app/packages/infra
RUN bunx prisma generate

# Build control app
WORKDIR /app/apps/control
RUN bun run build

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

# Copy the built workspace packages (including prisma client)
COPY --from=builder /app/packages /app/packages

# Copy the built control app
COPY --from=builder /app/apps/control/dist /app/apps/control/dist
COPY --from=builder /app/apps/control/package.json /app/apps/control/package.json

# Copy prisma config for database migrations directly from build context
COPY prisma.config.ts /app/prisma.config.ts

WORKDIR /app/apps/control
EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
