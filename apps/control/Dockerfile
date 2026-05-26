FROM oven/bun:1.1.34-slim AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY apps/control/package.json ./apps/control/
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/control/node_modules ./apps/control/node_modules
COPY . .
WORKDIR /app/apps/control
RUN bun run build
ENV NODE_ENV=production
EXPOSE 3000
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
