FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: PRUNE
# turbo prune produces:
#   out/json/  → only package.json files — used to cache the install layer
#   out/full/  → full source of required workspaces — used for build
# ────────────────────────────────────────────────────────────────────────────
FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune control --docker

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: INSTALL (dev + prod deps)
# Only package.json files → Docker layer cache is preserved across code changes.
# --ignore-scripts: skips husky and other local-dev lifecycle hooks that have
# no business running inside a container.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: PROD-INSTALL (production deps only)
# --ignore-scripts is critical: husky is a devDep so it is never installed,
# but without --ignore-scripts bun still tries to run prepare → crash.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS prod-install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 4: BUILD
# Full dev deps are available here so prisma generate (which needs
# @prisma/config, a devDep) can run successfully.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .
# Generate Prisma client — requires @prisma/config (devDep), hence must run
# here in the builder (full dev deps) NOT in the release (prod only) stage.
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

# Prisma generated client (built in builder, copied as a static artifact)
COPY --from=builder /app/packages/infra/prisma/generated ./packages/infra/prisma/generated

# Compiled app bundle only — no raw TypeScript
COPY --from=builder /app/apps/control/dist ./apps/control/dist
COPY --from=builder /app/apps/control/package.json ./apps/control/package.json

WORKDIR /app/apps/control
EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
