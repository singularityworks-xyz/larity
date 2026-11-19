# Feature refactor verification

The refactor is on `refactor/feature-structure`. See the [implementation plan](feature-structure-implementation.md), [codebase map](../codebase.md), and [development guide](../../docs/DEVELOPMENT.md).

| Milestone | Evidence |
| --- | --- |
| M0 | The published Nix version and hash match `d662da7`. The commit hook no longer bumps versions. CI checks both Rust crates with locked dependencies. |
| M1 | Control, worker handoff, and job checks passed with 10 Bun tests. Control bundled successfully. |
| M2 | The desktop feature gate passed 15 Bun tests. Four JS builds, including web and mock, passed. The desktop Rust suite passed 22 tests. The mock crate built and reported zero tests. |
| M3 | The realtime, STT, and Redis gate passed 62 tests. |
| M4 | The meeting analysis, realtime, and STT gate passed 191 tests. Both analysis modes completed the local meeting smoke scenario. |
| M5 | Removed unreferenced code and retired debug probes. Lint passed, and both native crates passed formatting and locked Clippy checks. |
| M6 | The clean checkout at `2b0af5b` used Bun 1.3.14 with a frozen lockfile. Prisma generation, lint, 12 uncached type checks, 229 Bun tests across 56 files, and four JS builds passed. Both native crates passed their locked checks. |

After M6, `e6fbf28` added replacement context and development docs. The only later source change is `1b04727`, which gives the mock app a unique native bundle identifier; its Linux deb and rpm packages built successfully. The verification-record commit is documentation-only. No other source changes followed the fully tested `2b0af5b` revision.

## Deletion and comment audit

- Removed 26 modules after checking import paths, symbols, test and script roots, runtime registration, and package exports. They were dormant control wrappers, unused desktop view code, a mock transcript prototype and unused alert helpers, two unreferenced marketing sections, duplicate Prisma files, and unused speaker persistence.
- The pre-meeting brief route, scheduled queue and worker, native meeting detection, mock overlay and latency harness, and Prisma public paths remain in use. Legacy Redis channel handling and environment aliases are compatibility paths with deployed consumers that cannot be ruled out from this repository alone.
- Handwritten TypeScript and TSX comment nodes went from 2,139 at `548bba0`, to 1,888 at the audited start `9755125`, to 269 at `2b0af5b`. That is an 87.4% gross reduction from the live-pipeline baseline and 85.7% from the audited start. The comment pass removed 1,420 nodes from retained files, reducing their count from 1,689 to 269 (84.1%). The 269 remaining nodes are tool directives, empty-handler intent, timing and compatibility constraints, and units; keeping these explains the small gap from the roughly 90% gross target. Generated Prisma files were excluded from the count.
- Standalone Rust comment lines went from 251 to 94 during the comment pass. The remaining notes cover native audio paths, scheduling constraints, and platform behavior. Inline Rust and stylesheet comments were outside those measurements.

## Meeting smoke

The smoke passed in legacy and live mode against disposable Postgres, Redis, and RustFS. It exercised meeting scheduling, brief generation, two authenticated clients, tagged audio frames, a final transcript and alert, participant reconnect, ending the meeting, and the recording-to-review job chain. The verification checked processing status, transcript, and insights through the control API. Deepgram, Gemini, and General Compute used deterministic fixtures. Native capture hardware requires a separate manual check.

## Container image smoke

The control and realtime images built from `2b0af5b` started against disposable Postgres and Redis. Control applied all 14 migrations and started; realtime connected to Redis and logged that it was ready. The workers image built from `1b04727` returned HTTP 200 from `/health`, with Redis healthy and all five registered workers active.

## Release checks

The desktop deb, rpm, and AppImage built on Linux from the verified source. The mock deb and rpm built at `1b04727`, which replaces the mock's template bundle identifier with its own. The published desktop Nix version and hash were unchanged by these packaging checks. Windows MSI and NSIS builds require the Windows release job and were outside this Linux verification.
