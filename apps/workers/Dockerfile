FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY apps/workers/package.json ./apps/workers/
COPY packages ./packages
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/workers/node_modules ./apps/workers/node_modules
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
USER bun
ENTRYPOINT [ "bun", "run", "apps/workers/index.ts" ]
