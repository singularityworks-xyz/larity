# larity

A Turborepo monorepo project using Bun runtime.

## Setup

To install dependencies:

```bash
bun install
```

This will also set up Husky pre-commit hooks automatically.

## Development

To run:

```bash
bun run index.ts
```

## Code Quality

This project uses [Biome](https://biomejs.dev/) for linting and formatting. See [.biome.md](.biome.md) for detailed documentation.

### Quick Commands

- `bun run lint` - Check for linting errors
- `bun run lint:fix` - Automatically fix linting issues
- `bun run format` - Format all files
- `bun run format:check` - Check if files are formatted correctly
- `bun run check` - Run both format check and lint

### Pre-commit Hooks

Husky is configured to automatically run format and lint checks before each commit. Commits with linting or formatting errors will be blocked.

## Project Structure

This is a Turborepo monorepo with the following structure:

- `apps/` - Application packages
  - `desktop/` - Tauri desktop application
  - `realtime/` - Real-time WebSocket server
  - `workers/` - Background workers
- `packages/` - Shared packages
  - `infra/` - Infrastructure utilities (Redis, RabbitMQ, Prisma)

---

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
