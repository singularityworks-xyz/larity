# Larity feature-structure refactor: implementation runbook

**Start here:** This is a continuation, not a restart. Work on the existing `refactor/feature-structure` branch. The audited starting point is `9755125`, on top of `548bba0` (live-pipeline integration) and `d662da7` (pre-refactor `main`). Preserve those commits and the working behavior they introduced. The first change is to fix release metadata and stop ordinary commits from rewriting it. Do not start by moving files.

## 1. Scope and execution rules

**Goal:** Put each feature's implementation and tests under a clear owner; split modules where they mix responsibilities; remove proven dead code and redundant comments; leave the deployment topology and public contracts intact. Finish with reproducible checks and new technical docs derived from the result.

- Use manifests, source, tests, CI, Dockerfiles, Compose, native command registrations, and release configuration as technical evidence. Use the old docs only to understand the product. Do not copy their directory maps or operating instructions.
- Keep `apps/control`, `apps/realtime`, `apps/workers`, `apps/desktop`, `apps/web`, `apps/mock`, and the existing packages as separate workspaces. Do not add a new service, package, framework, ORM, state manager, or UI design system to make the tree look cleaner.
- Preserve HTTP routes, methods, response shapes, status codes, and scoping; WebSocket framing, close codes, and event ordering; Redis keys, channels, and payloads; queue names, job IDs, retry semantics, and persistence; native commands and events; runtime flags, defaults, thresholds, and platform behavior. A deliberate behavior change needs its own commit and test, or belongs in a follow-up.
- Keep product features where they are used. A module used by multiple files in one feature stays in that feature. Cross-feature callers use the owning feature's public function or type. Only put genuinely cross-cutting plumbing in `lib` or `shared`; don't add a generic `utils`, `common`, or `services` dumping ground.
- Move a working slice first. Extract or deduplicate in a second commit when the responsibilities actually change. Delete in a separate reviewable commit. Update test paths, imports, and mocks in the commit that moves their code. Never leave half a move across commits.
- Run read-only lint, type checks, and `git diff --check` while working. **Run tests only at the numbered milestone gates.** Retry the same focused gate after fixing a gate failure; do not run the whole suite until M6. Do not disable CI, skip hooks to make a commit pass, weaken assertions, or add suppressions to hide regressions.
- Stage named files/directories, review `git diff --cached --stat` and `git diff --cached --check`, then commit. Check `git status --short --branch` and `git show --stat --oneline HEAD` after each commit; hooks can change the index. Do not stage `.env`, local outputs, or unrelated edits. Do not push, tag, publish, or merge unless separately asked.

### Starting checks

```sh
git status --short --branch
git log -3 --oneline
git diff --stat main...HEAD
```

If on another branch, confirm the working tree is clean before switching to the existing refactor branch. If there are unrelated edits, preserve them; don't stash, reset, overwrite, or commit them. This runbook may be untracked; leave it out of implementation commits unless asked to commit it. If HEAD has advanced, compare the new commits with this runbook and mark already-completed items instead of redoing them. Stop if the audited starting commits aren't ancestors and you can't identify the correct branch.

### How to move any feature

1. List its source files and tests with `git ls-files`. Find consumers with `rg` by exported symbol, path, event/command name, and config key as applicable. Check static and dynamic imports, package exports, test mocks, route registration, scripts, native registration, Docker/Compose, and CI.
2. Identify the owner using the tables below. Move source and adjacent tests with `git mv`. Update imports and runtime/test wiring in the same change. Check relative paths and move affected fixture imports. For transport and bootstrap files, keep old process entrypoint paths unless a milestone explicitly migrates them.
3. Search again for the old path **and** symbol. Inspect the staged diff with rename detection (`git diff --cached -M --stat`). A move-only commit should not change payloads, timing, query keys, error handling, or public exports. If a compatibility re-export is necessary, list the external caller and how/when it can be removed. Don't leave temporary shims for internal paths.
4. Extract behavior only after the move is stable. Give the new module a name that describes what it owns. The caller should still control operation ordering, transactions, cancellation, and error policy. Avoid a wrapper that just calls the original method with the same arguments. Split on a responsibility, not on a line-count quota.
5. At a milestone gate, record the commit SHA, commands, test totals, and any warnings. If checks fail, fix the current slice before starting the next. If a failure looks pre-existing, reproduce it at the prior milestone or audited baseline in a separate temporary checkout. Record the evidence; don't reset the active branch or report a blocked check as green.

Use this handoff format after each gate: `M<number> — passed/blocked; commits: <SHA(s)>; checks: <command and result>; exceptions: <none or evidence>; next: <one concrete task>`. Resume from the first incomplete gate, not from the first unchecked file in the tree.

### Verified baseline (not the finish line)

| Check | At `9755125` |
| --- | --- |
| Bun tests | 224 passed, 54 files; root `test` already runs `bun test`, like CI. |
| Type checks | 11 uncached Turbo TypeScript tasks passed. |
| Lint and formatting | Biome checked 456 files; desktop and mock Rust formatting passed. |
| JS builds | Control, web, and desktop frontend passed from a committed-source snapshot with installed deps. This did not build a native package. |
| Locked Rust | Both crates failed before compilation: package manifests and `Cargo.lock` were out of sync. |
| Comment count | 2,139 handwritten TS/TSX comments before the cleanup commit; 1,888 at HEAD (about 12% fewer). Measured as comment nodes, not lines. |

Already done: pipeline WIP is committed, pre-meeting brief worker is registered, desktop client-query duplication and old dashboard are removed, schedule pickers are extracted, and the meeting daemon lives in `service.ts`. Verify these remain intact; don't redo them. The boot shim in `packages/meeting-mode/src/index.ts` still serves Compose and is intentional for now.

## 2. Milestone order

| Order | Milestone | Must be true before continuing |
| --- | --- | --- |
| M0 | Release and verification tooling | Refactor commits can't rewrite versions; both Rust manifests pass locked checks; local and CI checks agree. |
| M1 | Control API, workers, and job contracts | Domain ownership is visible in the tree; HTTP and queue handoff checks pass. |
| M2 | Desktop, marketing web, and mock | Desktop route files are wiring, not feature implementations; frontends build and focused tests pass. |
| M3 | Realtime and STT | Transport, sessions, audio, events, and provider connection responsibilities are clear; focused wire tests pass. |
| M4 | Meeting analysis and enrichment | Engine coordinates named modules; same events and decisions in both supported modes. |
| M5 | Dead code, dependency, and comment cleanup | Every deletion has evidence; keep or remove decisions are recorded; measured comment target is accounted for. |
| M6 | Clean verification and replacement docs | Full checks, packaging, and meeting smoke evidence exist; docs match the shipped wiring. |

## M0 — Fix release metadata and check wiring

1. Inspect `lefthook.yml`, `scripts/version-manager.ts`, `scripts/version-manager.test.ts`, `.github/workflows/release.yml`, `flake.nix`, both Tauri manifests and lockfiles, and `apps/desktop/default.nix`. Compare relevant files to `d662da7` and inspect the two refactor commits. The hook is an actual source of unrelated staged edits, not just log noise.
2. Remove `version-bump` from ordinary pre-commit handling; keep lint and type checks. Keep the version tool as an explicit release command, e.g. `bun run version:bump`, using the existing tool and argument handling. It reads both staged and unstaged files and stages version edits; don't execute it in the live checkout while validating this change. Stop both the normal and `--reset` paths from rewriting `apps/desktop/default.nix`: that file pins a **published** artifact and the release workflow updates version and hash together. Confirm with a focused version-manager test or a disposable copy. Don't change release triggers or push a tag.
3. Restore the known paired artifact pin from `d662da7`: `apps/desktop/default.nix` must match the `0.1.20` artifact **and its matching hash**. Don't try to manufacture a hash, increment the pin, or interpret `0.1.20` as a recommendation to change the local crate version. Revert only automatic version edits in the two refactor commits, where release metadata had no intended change. Inspect `package.json`, touched workspace manifests, both `Cargo.toml` files and `tauri.conf.json` files. Restore version **fields**, not entire manifests with genuine test/task changes. Reconcile each lockfile against its manifest; prefer the existing lock if restoring the version fixes it. Regenerate only if necessary; inspect for unrelated dependency churn.
4. Keep root `bun run test` and CI using the same repository-wide Bun discovery. Don't replace it with a Turbo filter. Add a non-mutating root JS lint command (`lint` → `ultracite check`) and an explicit formatter/fixer (`fix` → safe fixes, plus intentional formatting). Inspect `Makefile` and other callers before changing `check`; make it a read-only check or migrate callers in the same commit. Fix `setup`'s reference to the nonexistent `db:generate` by pointing it to `db:gen`. Do **not** execute `setup`, schema push, or migration against existing local or remote data while checking command wiring.
5. Validate both crate manifests in CI. Rust formatting, Clippy, and the final test gate should cover desktop and mock. Use `--locked` when checking dependency resolution. Once both locks are consistent, don't silently regenerate them as a side effect of a lint hook. Keep the root TS + Rust checks callable independently so a Rust dependency error doesn't hide a TS error.

**Commit examples:** `chore(release): separate version bumps from refactor commits`, `fix(release): restore artifact pin and locked crate metadata`, `chore(repo): align read-only verification commands`.

**M0 gate:** Run `bun test scripts/version-manager.test.ts`, `bun run lint`, and both Rust format and locked Clippy checks. Run `cargo metadata --locked --manifest-path <manifest> --format-version 1` with each manifest to confirm the lock resolves. Check that `git diff d662da7 -- apps/desktop/default.nix` is empty and that a normal commit didn't stage any version changes. If the machine lacks native build dependencies, provision the CI-equivalent dependencies or record the precise unmet prerequisite and stop before declaring M0 passed. `cargo test` is reserved for the desktop gate and final gate.

## M1 — Control API and workers by domain

### Control moves

Keep `apps/control/src/index.ts`, `server.ts`, and `server.test.ts` as composition, entrypoint, and server-level contract test. Keep `env.ts`, logging, and generic auth/pagination/error/DB adapters separate from feature code. Use this table for `apps/control/src/`; a stem includes the matching `routes`, `services`, and `validators` files that exist today.

| Source stems or files | Destination under `apps/control/src/` |
| --- | --- |
| `auth`, `users`/`user`, `orgs`/`org`, `org-invite` | `features/identity/{auth,users,orgs}`; org invites live with orgs unless the file set warrants `orgs/invites`. |
| `clients`/`client`, `client-member` | `features/clients/` and `features/clients/members/`. |
| `policy-guardrails`/`policy-guardrail`, `default-guardrails` | `features/clients/guardrails/`; keep existing URLs and authorization even if the path is not a client URL. |
| `meetings`/`meeting`, `meeting.test.ts` | `features/meetings/`; move the validator test with its validator. |
| `meeting-session`, `internal-session`, `meeting-participant` | `features/meetings/sessions/`, with participant handling in `sessions/participants/` if it has multiple files. |
| Brief route logic and scheduled enqueue logic currently in `server.ts` | `features/meetings/briefs/`; keep the cron registration in composition or expose a feature plugin used by composition. Verify `meeting-brief.service.ts` reachability before moving it; see M5. |
| `transcript`, `meeting-insights` | `features/meetings/review/` with `transcript/` and `insights/` only when several files own those responsibilities. |
| `decisions`, `open-questions`, `important-points`, `tasks`, and their service/validator stems | `features/meeting-records/{decisions,open-questions,important-points,tasks}/`; don't pull cross-meeting records under a particular meeting session. |
| `documents`, `reminders`, `notifications`, `home` and corresponding service/validator stems | `features/documents/`, `features/reminders/`, `features/notifications/`, `features/home/`, respectively. |

1. Move the simpler CRUD slices first. Move meetings and identity last, one set at a time. Keep route plugin order and prefixes in `server.ts`, including the internal session routes outside the protected `/api` group and their existing guards. Keep HTTP-specific parsing and error mapping at the boundary.
2. Replace generic `routes/index.ts`, `services/index.ts`, and `validators/index.ts` imports with direct feature imports; remove the old barrels once no consumer remains. A single explicit feature entrypoint is okay where composition actually needs one; no broad wildcard barrels inside features.
3. Split the current meeting-session service by responsibility: lifecycle (`start`, `startAdhoc`, `join`, `end`), status/activity/lookup, context preload, and cleanup/job orchestration. Move serialization only if shared by multiple seams. Keep a narrow facade until the internal callers use the new owners; remove pass-through methods with no purpose. Preserve exactly when Redis changes, when Postgres commits, when a job is enqueued, and which error the caller sees. Preserve the session-listener file for the M5 reachability decision; don't activate it during a move.
4. Add or update contract tests for route reachability, response/error shape, the existing unauthorized/tenant boundary, and session start/end side effects. Use the existing request and dependency seams; do not introduce a second server entrypoint for tests or call production services.

### Workers and jobs moves

Keep `apps/workers/index.ts` as the Docker entrypoint and `src/index.ts` as registration/health/shutdown. Under `apps/workers/src/`, move `transcribe.worker.ts` to `jobs/transcribe/`, `summary.worker.ts` to `jobs/summary/`, `pre-meeting-brief.worker.ts` to `jobs/pre-meeting-brief/`, `client-persona.worker.ts` to `jobs/client-persona/`, and `audio-cleanup.worker.ts` to `jobs/audio-cleanup/`. Move `chunking`, `commitments`, `deduplication`, `embeddings`, `extraction-llm`, `final-analysis-llm`, and `talk-time` into `summary/` **if their only current owner is summary**. Move shared `job-status`, `worker.ts`, and shared provider initialization to `runtime/` (provider singleton in `runtime/` only if genuinely shared). Update dynamic imports in registration. Don't copy the brief generator into the worker.

1. Keep queue producer definitions in `packages/jobs` and handlers in `apps/workers`. Do not rename queue strings or job IDs. If the exact same queue-name literals are repeated across producers and consumers, expose named constants from the existing jobs package only if importing those constants doesn't open a connection; separate pure definitions from side-effectful queue setup if needed.
2. Split summary into job orchestration, analysis/enrichment, and persistence. Preserve transaction scope and iteration ordering when extracting persistence. Split transcription into source retrieval, transcription/speaker alignment, and persistence only where the current seams are distinct. Avoid a new framework for worker registration; if a heterogeneous list forces repeated casts, use the exact health/close interface registration needs rather than changing worker generics globally.
3. Preserve the existing five registered jobs, including pre-meeting brief. Check the handoff from control → queue name/payload → registered brief handler and transcribe → summary. Add a focused test at the registration/dispatch boundary and a summary or transcription retry/status case for any extracted behavior. Test with fakes rather than relying on real provider keys.

**M1 gate:** `bun test apps/control/src apps/workers/src packages/jobs`; then validate `bun run lint` and uncached TypeScript tasks. Make sure the gate actually discovers the new worker tests; do not interpret a path with no tests as proof of coverage. Verify the control build and no route or queue contract changed. Stop if any legacy top-level control layer folders still hold a moved domain file without a written exception.

## M2 — Desktop, marketing web, and mock

### Desktop target layout

Keep `apps/desktop/src/main.tsx` as router/provider composition and `app.tsx` as shell. Keep `routes/` as thin route adapters (params, guard, and page binding) so paths and registration remain obvious. Keep native code in `src-tauri/`; no UI redesign.

| Existing source | Target under `apps/desktop/src/` |
| --- | --- |
| Feature `meetings/`, route files for start/join/brief, and waiting room logic | `features/meetings/setup/`, with shared meeting queries/types at the meetings root if used by setup, live, and review. |
| Feature `meeting-live/`, live route body, `features/alerts/`, `services/{audio-streaming,vad}.ts` | `features/meetings/live/`, with `transcript/`, `alerts/`, and `capture/` where useful; colocate streaming tests. Alert internals that overlay also uses live at `features/meetings/alerts/` instead. |
| `meeting-post/` and post-meeting route body | `features/meetings/review/`, with transcript and analysis sections next to queries for them. |
| `overlay/`, route body, `lib/overlay-window.ts` | `features/meetings/overlay/`; move overlay window bridge with caller if this is its only owner. Keep the `/overlay` route and any existing query/message contract. |
| `routes/home.tsx`, `components/home/`, `features/home/` | `features/home/`. Put active home widgets here; check old widgets first rather than moving everything. |
| `routes/settings.tsx`, client route bodies, onboarding/auth route bodies | `features/settings/`, `features/clients/`, `features/onboarding/`, `features/auth/`. Keep shared shell components and app-wide guards out of feature pages. |

1. Move pages, hooks, components, tests, and types before splitting the page bodies. Preserve the single canonical `features/clients` list query, its cache key, and all invalidation behavior. Verify onboarding goes to `/home`; don't restore the removed dashboard or create an alias route without an actual consumer.
2. Extract live route responsibilities in this order: event-to-state projection (pure where practical), session/audio lifecycle (own subscribe/unsubscribe and shutdown), then presentational sections. Keep one connection owner. Verify reconnect doesn't register duplicate listeners. Extract post-meeting polling/processing state and presentation similarly; keep existing terminal status and refetch behavior. Move settings' independently owned panels only when they have distinct logic. Preserve picker behavior and avoid rewriting interactions as part of moving them.
3. Inspect `src-tauri/src/lib.rs`, `src-tauri/src/audio/`, and `meeting_detection.rs`. Keep `lib.rs` as native registration and app setup; move command handler bodies into existing native domains **only** if they add clear ownership. Keep exposed command strings, event names, capability IDs, platform gates, buffer handling, and cleanup unchanged. Don't split capture and mixing code merely to create more directories.
4. Update live mapper, audio streaming, and processing status tests with the move. Add regression cases where code was actually split: event mapping for reconnect/unknown messages, one connection/listener cleanup, processing-status transitions, and schedule conversion or routing if the extracted logic changes location or shape. Don't apply a wholesale UI test framework migration.

### Web and mock

- `apps/web`: Move active landing sections beside the home feature (`src/features/home/sections/`); move downloads page logic into `src/features/downloads/`. Keep navigation and footer shared if both use them. Retain page URLs, legal and installer links, serverless API location, plugins, and the Vite entrypoint. Check `bento-grid.tsx` and `spotlight.tsx` in M5 before moving or deleting them. No marketing rewrite.
- `apps/mock`: Keep the overlay, native mock, and `scripts/latency.ts` harness. Group active overlay and alert UI under one `src/features/mock-overlay/` owner if both are used there. Check `src/utterance/` in M5: its exclusion from TS typechecking isn't proof it's unused. Add a plain JS `build` task (`vite build`) if still missing, so native `beforeBuildCommand` can call it without recursively invoking Tauri. Use a separate TS check, and don't expand ignored source just to satisfy a new build command before reachability is understood.

**M2 gate:** `bun test apps/desktop/src`; run both locked native test suites (`cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml` and the corresponding mock manifest), read-only lint, type checks, and Turbo builds. Ensure mock's JS build is actually included or run its own build. For frontend build env, use local placeholder `VITE_CONTROL_URL` and `VITE_WS_URL`, or a clean source copy with fixture env; never bake production env into audit output. Native packaging is the final gate, not implied by Vite success. Stop if an existing URL or native command path changes.

## M3 — Realtime and STT

### Realtime

Keep `apps/realtime/src/index.ts` and `server.ts` responsible for process setup and WebSocket/HTTP registration. Under `src/`, use `transport/` for socket handlers and socket-specific types, `sessions/` for validation and the active connection registry, `audio/` for stream coordination, `events/redis/` for channel handlers and subscription wiring, and `admin/` for the metrics route. `handlers/validate-session.ts` goes to `sessions/`; `session.ts` starts there. Move related tests with their owner; keep server-level tests near server composition.

1. Move and rewire imports, including test mocks and `apps/realtime/scripts/` clients. Keep the external WebSocket and metrics routes identical. Extract subscriber responsibilities by event family (session lifecycle, STT, results/alerts as observed in code) rather than making one new subscriber per channel. One subscription owner holds registration and teardown. Split transport backpressure policy from registry if the registry is simultaneously making partial-drop/send decisions.
2. Make queue/drop policy explicit in one owner. Preserve the close codes, timestamp/VAD normalization, deduplication, socket identity, session membership, partial-vs-final priority, and replacement connection behavior. Do not move auth checks after audio acceptance or replace validated payloads with unchecked casts.
3. Compare repeated event types/channel builders across realtime, meeting-mode, STT, DB Redis, and desktop. Compare their values and validators before consolidating: similar names aren't proof that payloads are identical. Choose the existing owning package for each contract and import narrow side-effect-free exports. Avoid a new `contracts` package unless an actual cross-workspace cycle can't be resolved with existing ownership. Do not change a wire value to make types look alike.

### STT

In `packages/stt/src/`, keep `index.ts` as the public API, `session-manager.ts` as multi-session coordination, and `deepgram/batch.ts` isolated from streaming. For `deepgram/connection.ts`, identify provider config, outbound queue/keepalive, reconnect policy, and transcript decoding/anchoring. Extract pure policy/format helpers first, then keep one connection object responsible for socket generation, timers, and lifecycle. Put connection policy and tests in `deepgram/streaming/` if the extraction creates multiple modules; preserve public exports and mock paths used by consumers. Keep the Deepgram patch in place unless a separate dependency test proves it unnecessary.

**M3 gate:** `bun test apps/realtime/src packages/stt/src packages/db/redis`. Check existing anchor, config, keepalive, queue, reconnect, session, Redis forwarding, WS-limit, and backpressure cases. Add a case if a split has no contract asserting drop priority, time anchoring, or stale-socket handling. Verify compilation of control/desktop/meeting-mode consumers after any shared type change. Stop if a consumer and producer disagree on a fixture; fix ownership instead of adding one-off parsing helpers.

## M4 — Meeting-mode feature ownership and engine split

`packages/meeting-mode/src/index.ts` keeps named public exports; `service.ts` owns daemon construction and shutdown. Keep the `import.meta.main` boot shim and Compose `index.ts` invocation unless there is a specific reason to migrate them; if migrated, update both Compose files, package scripts, image smoke checks, and benchmarks in the same commit. Importing library exports must not start the service.

| Current code | Target owner under `packages/meeting-mode/src/` |
| --- | --- |
| `subscriber.ts`, `channels.ts` | `events/`; split dispatch and transport only where separately testable; keep one Redis subscription lifecycle. |
| `utterance/`, `speaker/`, `speaker-state/` | `transcript/utterances/`, `transcript/speakers/`, `analysis/speaker-state/`, respectively. Speaker attribution and analysis of speaker behavior are different responsibilities. |
| `pipeline/engine.ts`, specs, metrics | `analysis/` for orchestration and analysis-specific telemetry; move trace helpers with the callers that own the recorded events. |
| Tier 1–4, live analyzer/decision/scheduler, `speculative/` | `analysis/{tiers,live,speculative}/`; use tier subdirectories where there are multiple implementation files and tests. Keep shared types near their owner. |
| `commitment/`, `constraint/`, `topic/`, `cost/`, `alerts/`, `briefs/` | Keep these owners; use a named `ledgers/` parent for commitment/constraint if it improves navigation. Don't fold briefs or persistence into the analysis engine. |

1. Move domains mechanically with their tests. Update library exports, direct benchmark imports, process scripts and any workspace imports. Don't move a file solely to change its name. Keep the cross-workspace API surface stable in this pass.
2. Split the engine in this order: pure gate/evidence selection, live scheduling and per-session latest input, legacy tier orchestration, emission and telemetry. Extract one seam at a time. The engine still owns orchestration order, backpressure, and clearing/disposal boundaries. Avoid a second owner for per-session state or a singleton that leaks across tests. Keep tier-specific prompting, caching, and error policy with the corresponding tier if already there.
3. Capture a before/after behavior record from deterministic fixtures. Cover legacy as the default and live when enabled; backlog/supersession, evidence selection, speculative fallback/throttling, cost caps, topic and speaker context, duplicate/final dispatch, and alert/trace output. Keep the benchmark harness useful; compare its fixtures if an extraction touches the hot path. Do not require external model calls for tests or assert a wall-clock microbenchmark threshold in a noisy CI runner.
4. Keep `MEETING_PIPELINE_MODE`, speculative opt-in, existing merge env fallback, and legacy STT subscription behavior unless M5 proves a separate retirement is safe. Refactoring is not a rollout decision. Verify startup on a local test stack or at M6; a pure import test is not evidence that Redis subscriptions initialize.

**M4 gate:** `bun test packages/meeting-mode/src apps/realtime/src packages/stt/src` and uncached type checks. Confirm startup wiring with a controlled smoke or by reusing existing mocked service coverage, then repeat real local wiring at M6. Verify the engine has real responsibilities moved out (not just new folders around a monolith) and mode defaults are unchanged.

## M5 — Delete dead code and trim comments

### Dead-code procedure

For each candidate, record its old path/symbol, how callers were searched, the conclusion, and why it can be deleted or must stay. Start with this list; it is **not** an approved deletion list:

| Candidate | Evidence to collect before deciding |
| --- | --- |
| Control `session-events.listener.ts`, `meeting-brief.service.ts` | Check process registration, tests and scripts. The brief feature is active via the route and queue worker even if this service wrapper has no callers. |
| Desktop old home widgets, unused live widgets, and meeting-detection wrapper | Check JSX, router composition, native events/commands, and mock UI. Removing an unreferenced TS wrapper does not authorize removing a native command. |
| Mock `src/utterance/` and unused alert helpers | Check app roots, latency/dev harness, dynamic imports, and Tauri configuration; remove an obsolete TS exclusion only with its owner. |
| Web `bento-grid.tsx`, `spotlight.tsx` | Check sections, conditional/static imports, and marketing asset references. Leave active assets and API handlers alone. |
| DB duplicate-looking Prisma/type files; meeting speaker persistence | Check package export subpaths, generated client settings, dynamic imports and persistence tests. Don't alter applied migrations or generated output by hand. |
| Unused dependencies, imports, exports, scripts, and ignore rules | Check workspace manifests, hooks, CI, deployment, package consumers, and native toolchain. Update the lockfile only for verified dependency changes; do not upgrade dependencies for this cleanup. |
| Legacy env aliases, event protocols, queue handlers, modes | Search for producers, consumers, configs and older deployed clients. If deployment evidence is incomplete, retain and document how to retire them later. A static import graph can't prove these are unused in production. |

No tracked code may be deleted purely because the compiler doesn't import it. Preserve generated Prisma outputs and historical migrations per the existing repository policy. Keep root scripts, Makefiles, Docker paths, native manifests, and package exports in the audit even though these are not feature folders. Remove obsolete ignores only after their targets are removed or made legitimate. Don't clear local ignored artifacts as part of source cleanup.

### Comments and lint

1. Use a syntax-aware count on the same tracked handwritten TS/TSX paths as the audit (`apps`, `packages`, `scripts`, exclude `prisma/generated`). Record comment nodes for `548bba0`, `9755125`, and final HEAD. Count comments removed from **retained** files as well (follow moves with `git diff -M`); report dead-file deletions separately so they can't masquerade as pruning. Count Rust explanatory comments separately, excluding required directives; note any unmeasured source types or estimates.
2. Delete descriptions that repeat the code, section banners with no navigation value, numbered implementation narratives, commented-out code, historical fix notes, stale TODOs, and generic docs on local functions. Prefer a better name over a paragraph. Preserve short explanations of timing/order, auth invariants, wire compatibility, platform limitations, cost and retry behavior, and non-obvious test fixtures. Keep mandatory directives and any required license/generated notices. Don't delete a lint directive without fixing its cause or confirming the rule no longer applies.
3. Target **roughly 90% fewer redundant/explanatory comments**, not 90% fewer bytes. As a sanity check, 10% of the original gross TS count is ~214 comments, before accounting for directives and true invariants. State both the actual gross percentage and the eligible-comment reduction. If important comments justify missing the gross target, give the count and categories; don't call ~12% equivalent to 90% and don't sacrifice required invariants to hit a quota.
4. Apply deterministic formatting separately from logic. Fix root causes of repeated lint exceptions at the appropriate owning scope; don't add blanket `any`, `as unknown as`, file exclusions, or another preset to make checks pass. Keep generated/vendor exclusions narrow. Run both Rust formatting and Clippy; include JS/TS across all workspaces and action workflow lint where configured.

**M5 gate:** Run lint, both `cargo fmt` checks, both locked Clippy checks, `git diff --check`, and the suites for the workspaces whose code or dependencies were deleted. Comment-only commits need static checks, not an extra test run. Record keep/delete decisions and comment counts. Stop if you cannot account for a dynamically used file, a removal changes a public import, or a new ignore rule hides an active problem.

## M6 — Full verification, then replacement docs

Use a fresh checkout of the exact branch SHA in a disposable directory. Install the Bun version declared in `package.json` and the native dependencies used by CI. Don't copy the existing checkout's `node_modules`, `.env`, or `target` directories. Use fixture values and a local disposable Postgres/Redis/object storage stack where needed; never point tests at existing production data or use production provider keys. Don't run seed scripts or schema mutation commands unless the target is independently confirmed disposable.

Run the following from the clean root, after M0 has introduced `lint`. Preserve each exit status; don't mask failures with a pipe.

```sh
bun install --frozen-lockfile
bun run db:gen
bun run lint
bun x turbo run check-types --force
bun run test
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo fmt --manifest-path apps/mock/src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path apps/mock/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/mock/src-tauri/Cargo.toml
VITE_CONTROL_URL=http://127.0.0.1:3000 VITE_WS_URL=ws://127.0.0.1:9001 bun run build --force --env-mode=loose
git diff --check
git status --short
```

- Verify discovery covers the same behaviors as the baseline 224 Bun tests, plus new regressions. A lower count needs a specific explanation of removed/merged coverage. Run `actionlint` and the CI image smoke checks if available. The tracked tree shouldn't change except for an intentional generated artifact policy; investigate any lockfile or checked-in generated diff before proceeding.
- Exercise the existing CI release build steps or equivalents for desktop native packaging on the platforms they support and the mock native build; do **not** run upload, publishing, release-tag or deployment steps. Verify the Nix recipe still points to the correct published version/hash pair. Record which artifact checks executed and which require unavailable tooling or runners. A JS build is not a packaging check.
- Exercise one full local meeting path: schedule and generate a brief; start and join with a second client; observe connection/session state; stream fixture audio or validated fixture events; observe at least one final transcript item and alert; end the meeting; confirm transcribe/summary completes and the review surface shows the result. Exercise both modes using fixtures or controlled provider stubs. Check reconnect/cleanup for a dropped client and close the local stack. If using stubs, say which external links were stubbed. If native audio wasn't exercised, don't label fixture event replay as hardware validation.
- Once observed behavior matches the refactor, write new technical context docs. Include the app/package map, ownership of major features, entrypoints, event and job handoffs, env default/override ownership, local test/build commands, and release workflow. Link source paths that were verified. Preserve still-valid product context, replace or clearly supersede obsolete technical docs, and don't turn the docs into a second copy of implementation details.
- Commit replacement docs separately. If the docs-only commit is after the verified SHA, verify the intervening diff is docs-only and note both the tested SHA and final SHA. If code changed after full verification, rerun the affected gate and the final checks needed to support the completion claim.

## Completion checklist

- [ ] Branch history preserves existing live-pipeline work; commits have a clear scope and no accidental release bumps.
- [ ] Source trees match feature ownership; feature tests live with their code, with cross-feature contract tests at the boundary they cover.
- [ ] No renamed route, transport field, command, queue, or env default without a separate documented behavior change. No unexplained compatibility wrappers or unused imports/exports remain.
- [ ] Dead code has deletion evidence, comment reduction is measured, and any important exceptions are recorded.
- [ ] Locked Rust, full Bun suite, typechecks, lint, clean builds, packaging, and local meeting smoke have actual results. Blocked or skipped steps are named explicitly, with the smallest next action to complete them.
- [ ] New docs match verified source. Final handoff includes branch, commit SHAs, test counts, and any remaining work. Say **done** only when the acceptance gates are met, not just because the working tree is clean.
