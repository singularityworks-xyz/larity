# Development and verification

This guide and the [codebase map](../.context/codebase.md) describe the current layout and workflows.

## Local setup

Use the Bun version in [package.json](../package.json). On Linux, use the native development dependencies in [CI](../.github/workflows/ci.yml). Create a local `.env` from [the example](../.env.example) and point it at a disposable development stack. The [development Compose file](../docker-compose.yml) configures Postgres with pgvector, Redis, and RustFS. Confirm all endpoints before applying migrations or starting capture.

```sh
bun install --frozen-lockfile
bun run db:gen
bun run dev
```

Turbo runs the workspace development scripts. You can run the service entry points from the project root for a focused check.

```sh
bun run apps/control/src/index.ts
bun run apps/realtime/src/index.ts
bun run apps/workers/index.ts
bun run packages/meeting-mode/src/index.ts
```

Set `MEETING_PIPELINE_MODE=live` for the live analysis path. The unset default is legacy. Keep the same database, Redis, and bucket configuration across the services handling a local meeting.

## Verification

During a staged refactor, run focused tests after each major milestone and the full suite at the final gate. Use the commit hook's static checks for small changes.

Install from the frozen lockfile and generate the Prisma client before running the final checks. Use local fixture URLs for builds and tests.

```sh
bun run lint
bun x turbo run check-types --force
bun run test
VITE_CONTROL_URL=http://127.0.0.1:3000 VITE_WS_URL=ws://127.0.0.1:9001 bun run build --env-mode=loose
```

Run native checks for both crates. The tests for capture and timing live with the desktop audio code.

```sh
for app in desktop mock; do
  manifest="apps/$app/src-tauri/Cargo.toml"
  cargo fmt --manifest-path "$manifest" -- --check &&
    cargo clippy --locked --manifest-path "$manifest" --all-targets -- -D warnings &&
    cargo test --locked --manifest-path "$manifest" || exit 1
done
```

For a meeting smoke test, create a scheduled meeting and generate its brief. Open a host socket and a participant socket, send fixture audio through the host, and check that the participant receives a final transcript and the host receives an alert. Reconnect the participant, end the meeting, and check the processing status, transcript, and insights endpoints. Run this scenario in legacy and live mode with a disposable Postgres, Redis, and object storage stack. Stub Deepgram, Gemini, and General Compute for deterministic verification. Test capture hardware separately.

## Packaging and releases

The [release workflow](../.github/workflows/release.yml) builds Linux packages and Windows installers. Its Arch container path produces the AppImage. The Linux deb and rpm equivalents can run in the desktop workspace with `bun run tauri build --bundles deb,rpm` after setting the desktop build URLs.

The commit hook checks staged code. Run `bun run version:bump` explicitly when preparing release metadata and inspect the staged version edits. The release workflow updates the [Nix recipe](../apps/desktop/default.nix) version and hash from the published artifact together.
