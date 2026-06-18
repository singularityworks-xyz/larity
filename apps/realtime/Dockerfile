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
RUN turbo prune realtime --docker

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: INSTALL
# --ignore-scripts prevents husky (devDep) from crashing the install
# ────────────────────────────────────────────────────────────────────────────
FROM base AS install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: RELEASE
# realtime is not compiled (runs raw TS via bun), so no build step needed.
# We run prisma generate here since the schema is available after full copy.
# ────────────────────────────────────────────────────────────────────────────
FROM base AS release
ENV NODE_ENV=production

COPY --from=install /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .

# Generate Prisma client for the Linux runtime
WORKDIR /app/packages/infra
RUN bunx prisma generate

WORKDIR /app
EXPOSE 9001
USER bun
ENTRYPOINT [ "bun", "run", "apps/realtime/src/index.ts" ]
