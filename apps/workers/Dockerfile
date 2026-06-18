FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

# Stage 1: Prune
FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune workers --docker

# Stage 2: Install dependencies
FROM base AS install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 3: Release
FROM base AS release
ENV NODE_ENV=production

# Copy node_modules
COPY --from=install /app/node_modules ./node_modules
# Copy only the pruned source code (workers + required packages)
COPY --from=pruner /app/out/full/ .

WORKDIR /app/packages/infra
RUN bunx prisma generate
WORKDIR /app

EXPOSE 8080
USER bun
ENTRYPOINT [ "bun", "run", "apps/workers/index.ts" ]
