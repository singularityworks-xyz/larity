FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

FROM base AS pruner
RUN bun install -g turbo
COPY . .
RUN turbo prune @larity/control --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
WORKDIR /app/packages/infra
RUN bunx prisma generate
WORKDIR /app/apps/control
RUN bun run build

FROM base AS prod-install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS release
ENV NODE_ENV=production
COPY --from=prod-install /app /app
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps/control/dist /app/apps/control/dist
COPY --from=builder /app/apps/control/package.json /app/apps/control/package.json
COPY packages/db/prisma.config.ts /app/prisma.config.ts
WORKDIR /app/apps/control
EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
