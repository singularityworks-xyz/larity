FROM oven/bun:1-slim AS base
ENV CI=true
ENV HUSKY=0
WORKDIR /app

# Install all dependencies (development + production)
FROM base AS install
COPY package.json bun.lock ./
COPY apps/control/package.json ./apps/control/
COPY packages ./packages
RUN bun install --frozen-lockfile

# Install only production dependencies
FROM base AS prod-install
COPY package.json bun.lock ./
COPY apps/control/package.json ./apps/control/
COPY packages ./packages
RUN bun install --frozen-lockfile --production

# Build the application
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/control/node_modules ./apps/control/node_modules
COPY . .
WORKDIR /app/apps/control
RUN bun run build

# Final minimal runtime image containing no source or dev dependencies
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
