FROM docker.io/oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune @larity/realtime --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
WORKDIR /app/packages/db
RUN bunx prisma generate

FROM base AS prod-install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS release
ENV NODE_ENV=production
COPY --from=prod-install /app /app
COPY --from=pruner /app/out/full/ /app
COPY --from=builder /app/packages/db/prisma/generated /app/packages/db/prisma/generated
WORKDIR /app
EXPOSE 9001
USER bun
ENTRYPOINT [ "bun", "run", "apps/realtime/src/index.ts" ]
