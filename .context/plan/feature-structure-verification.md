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
| M6 | A clean checkout at `2ca25a6` passed frozen install, Prisma generation, lint, 12 uncached type checks, 242 Bun tests across 60 files, four JS builds, both Rust formatting and locked Clippy checks, and desktop Rust tests (22 passed; mock reported zero tests). A second full Bun run passed with Redis available. |

The first M6 clean-checkout run at `2b0af5b` used the repository-pinned Bun 1.3.14 and passed 229 tests across 56 files. Later source commits added a unique mock bundle identifier (`1b04727`), synchronized Cargo lockfiles during explicit release version bumps (`e5115e7`), added control and worker contract coverage (`136b848`), extracted desktop live event and connection lifecycle hooks (`2ca25a6`), and isolated control route tests from Bun module-mock state (`554f866`). The mock Linux deb and rpm packages built at `1b04727`.

At `2ca25a6`, the clean-checkout verification used Bun 1.4.4 and passed the full 242-test suite, including with disposable Redis. At `554f866`, the repository-pinned Bun 1.3.14 full suite passed again: 242 tests across 60 files, 682 assertions. The final route-test isolation change also passed repository lint (460 files), a direct control typecheck, the control bundle build, and the commit hook's workspace typecheck. The 12-task workspace typecheck in that hook used Turbo cache; the changed control package was separately typechecked directly. The Rust sources did not change after their final checks at `2ca25a6`.

The replacement context and development docs were added in `e6fbf28`; subsequent verification and acceptance-record commits are documentation-only. This final documentation update follows the verified source commit `554f866` and records the continuation checks above.

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
