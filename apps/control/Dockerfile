FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

# Stage 1: Prune
FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune control --docker

# Stage 2: Install dependencies (Development + Production)
FROM base AS install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 3: Install only production dependencies
FROM base AS prod-install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --production

# Stage 4: Build
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
# Copy all local workspace packages & source code for the app
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/control
RUN bun run build

# Stage 5: Release
FROM base AS release
ENV NODE_ENV=production

# Copy production node_modules
COPY --from=prod-install /app/node_modules ./node_modules
COPY --from=prod-install /app/apps/control/node_modules ./apps/control/node_modules

# Copy built distribution files only
COPY --from=builder /app/apps/control/dist ./apps/control/dist
COPY --from=builder /app/apps/control/package.json ./apps/control/package.json

WORKDIR /app/apps/control
EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
