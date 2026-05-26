FROM oven/bun:1.1.34-slim AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY apps/workers/package.json ./apps/workers/
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/workers/node_modules ./apps/workers/node_modules
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
USER bun
ENTRYPOINT [ "bun", "run", "apps/workers/src/index.ts" ]
