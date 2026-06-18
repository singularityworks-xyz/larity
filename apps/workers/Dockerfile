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
RUN turbo prune workers --docker

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: INSTALL (dev + prod deps)
# --ignore-scripts prevents husky (devDep) from crashing the install.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: BUILD
# workers runs raw TS via bun (no compile step), but we still need a builder
# stage with full dev deps so that prisma generate can access @prisma/config.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .
WORKDIR /app/packages/infra
RUN bunx prisma generate

# ────────────────────────────────────────────────────────────────────────────
# Stage 4: RELEASE
# ────────────────────────────────────────────────────────────────────────────
FROM base AS release
ENV NODE_ENV=production

COPY --from=install /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .

# Copy Prisma generated client from builder (where devDeps were available)
COPY --from=builder /app/packages/infra/prisma/generated ./packages/infra/prisma/generated

WORKDIR /app
EXPOSE 8080
USER bun
ENTRYPOINT [ "bun", "run", "apps/workers/index.ts" ]
