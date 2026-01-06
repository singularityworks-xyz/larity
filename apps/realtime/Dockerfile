# Use the official Bun image
FROM oven/bun:1.1.34-slim AS base
WORKDIR /app

# Stage 1: Install dependencies
# We copy the root package.json and lockfile, plus the app's package.json
# to leverage Docker's layer caching for node_modules.
FROM base AS install
COPY package.json bun.lock ./
COPY apps/realtime/package.json ./apps/realtime/
# If other packages have package.json, they should be copied here as well.

RUN bun install --frozen-lockfile

# Stage 2: Production Release
FROM base AS release

# Copy node_modules from install stage
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/realtime/node_modules ./apps/realtime/node_modules

# Copy the rest of the application code
# This includes apps/realtime/src and packages/infra/redis
COPY . .

# Set environment variables
ENV NODE_ENV=production

# The port specified in apps/realtime/src/env.ts
EXPOSE 9001

# Run the application
# We use the path relative to the root since we're in a monorepo
USER bun
ENTRYPOINT [ "bun", "run", "apps/realtime/src/index.ts" ]
