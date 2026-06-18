FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: PRUNE
# turbo prune produces two outputs:
#   out/json/  → only package.json files (no source) — used for install layer
#   out/full/  → full source of only the required workspaces — used for build
# ────────────────────────────────────────────────────────────────────────────
FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune control --docker

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: INSTALL (dev + prod deps)
# Only package.json files are present here → perfect Docker layer cache.
# --ignore-scripts skips husky and other local-dev lifecycle hooks that are
# irrelevant (and broken) inside a container.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: PROD-INSTALL (production deps only)
# --ignore-scripts is critical: husky is a devDep so it is not installed, but
# without --ignore-scripts bun still tries to run the prepare script → crash.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS prod-install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 4: BUILD
# Run prisma generate here (not in install) because the schema file only
# exists after the full source is copied in.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .
WORKDIR /app/packages/infra
RUN bunx prisma generate
WORKDIR /app/apps/control
RUN bun run build

# ────────────────────────────────────────────────────────────────────────────
# Stage 5: RELEASE — minimal runtime image, no source code or dev deps
# ────────────────────────────────────────────────────────────────────────────
FROM base AS release
ENV NODE_ENV=production

# Production node_modules (no devDeps)
COPY --from=prod-install /app/node_modules ./node_modules
COPY --from=prod-install /app/apps/control/node_modules ./apps/control/node_modules

# Prisma generated client (built in builder stage)
COPY --from=builder /app/packages/infra/prisma/generated ./packages/infra/prisma/generated

# Compiled app bundle only — no raw TypeScript
COPY --from=builder /app/apps/control/dist ./apps/control/dist
COPY --from=builder /app/apps/control/package.json ./apps/control/package.json

WORKDIR /app/apps/control
EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
