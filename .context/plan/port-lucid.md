# PORT PLAN — LUCID (Phases 0–5 + provider migration) → LARITY

**Goal:** Bring every proven correctness, latency, observability, and scale fix from the Lucid repo (`~/repos/Lucid`) into Larity (`~/repos/larity`), plus the Tier-2/Tier-4 provider migration (SambaNova → General Compute `gpt-oss-120b`, Tier-4 → `gemini-3.5-flash-lite`), while keeping Larity's identity, UI work, and deployment untouched.

**Reference Documents:**
- `/home/haze/Documents/Lucid-docs/internal/plan.md` — source plan (Phases 0–6, all item IDs, evidence, decisions). Item IDs (P0.1 … P5.8) in this document refer to that file.
- `/home/haze/Documents/Lucid-docs/internal/architecture-and-flow.md`, `meeting-mode.md`
- Lucid `docs/TIERING.md`, `docs/VAD.md`, `docs/SPECULATIVE_PROCESSING.md`, `docs/FEATURES.md`
- Larity `.context/architecture-and-flow.md`, `.context/meeting-mode.md`, `.context/architecture_decisions.md`

**Rules for executing this plan:**
1. Phases are sequential. Do not start a phase until the previous phase's deliverables are checked off.
2. Every phase ends with the full suite green (`bun x ultracite check`, `bun test`, `bun x turbo run check-types`, `make rust-clippy` where Rust is touched) and, where a harness applies, a `bun run mock:latency -- --duration=30` run with numbers recorded below.
3. One PR per phase (Phase 4 may be split into 4a publish-path / 4b pipeline-path, mirroring Lucid's 2a/2b). Commit messages carry the original item ID, e.g. `perf(meeting-mode): P2.1 publish utterance before embedding`.
4. **Port mechanics:** prefer `git -C ~/repos/Lucid show <sha> > /tmp/p.patch` then `git apply --3way`, falling back to manual hunk porting. Files that only need a scope rename are copied wholesale (`cp Lucid/... larity/...` then `sed` `@lucid` → `@larity`). Never copy a file without diffing first when Larity has diverged (desktop UI, web, control — see Exclusions).
5. **Rebrand gate (every phase):** before opening the PR, `rg -n "@lucid|lucid:|lucid-|lucid\.app|Lucid" <touched paths>` must return zero hits. Larity keeps `@larity/*`, the `larity:` deeplink protocol, `larity.app` domain defaults, `larity-*` container/network names, and Larity assets.
6. **Deployment freeze:** Larity's `docker-compose*.yml`, `docker/`, absence of `Caddyfile`, `.github/workflows/*` domain defaults, and hosting setup are correct as-is (Larity is not deployed on AWS). Do not port Lucid deploy commits (`29e8b43`, `63b963f`, `206512e`, `a6ac6dd`, `9d1e5e6`, `68ef2a9`, `c78bb69`) or `docs/deployment-aws.md`. The only `.env.example` changes allowed are app-level keys (General Compute, Gemini model, Deepgram knobs) — no infra/deploy values.
7. Never change a documented constant without updating the matching doc in the same commit.
8. If an item requires a broader refactor than Lucid describes, stop and record the finding in the phase's Notes instead of expanding scope.
9. Lucid is a sibling worktree, not a git remote: transfer via `git show`/patch files or direct `cp`, never `git pull`/`git remote add`.

---

## Baseline (port targets — Lucid numbers from plan.md, measured 2026-09-20)

| Metric | Larity today | Target after port | Lucid evidence |
|---|---|---|---|
| Latency instrumentation | none (`docs/TIERING.md` metric section stale) | `metrics.ts` + `/admin/metrics` + `mock:latency` | P0.1–P0.7 complete |
| `ingest.frames_dropped_connecting_total` (30–180 s run) | unknown (no counter) | 0 | 29 → 0 (P1.4) |
| `stt.orphan_events_total` after forced reconnect | unknown | 0 | P1.3, reconnect test |
| Speech end → publish | embed awaited (~700 ms+ term) | publish before embed (~8 ms observed, embed 783 ms off-path) | P2.1 live proof |
| Merger gap (`MERGE_PUBLISH_GAP_MS`) | 700 | 250 | P2.3 |
| Redis commands per utterance (typical) | 7–9 | 5–6 | P2.10 structural table |
| Tier-2 timeout | 8000 ms | 3000 ms | P2.7 |
| Tier-2 provider | SambaNova (env keys exist) | General Compute `gpt-oss-120b`, `reasoning_effort=low` | `a72478c`, `9fbcf7a` |
| Tier-4 model default | `gemini-3.1-flash-lite` | `gemini-3.5-flash-lite` (+ pricing $0.30/$2.50) | `9fbcf7a` |
| Tier-2 fallback gate | `shouldStop=false` (loosens Tier 4) | `shouldStop=true` unless T1 hit / T3 contradiction | P1.8 |
| Test files (`*.test.ts`, excl. node_modules) | 4 | ≥ 49 | Lucid count |
| Speculative processing | absent / legacy | flag `SPECULATIVE_ENABLED` default OFF (NO-GO) | P3 |
| Desktop audio transport | base64/JSON/eval `app.emit` | Tauri `Channel<Vec<u8>>`, zero `audio-frame` emits | P4.1 |
| Realtime fan-out | 9 global `PSUBSCRIBE`, no backpressure | per-session subscribe, 256 KB partial shed, `ws.raw` close fix | P5.2, P5.5, `f3acb1b` |

---

## Exclusions (do NOT port)

| Lucid commit / area | Why excluded |
|---|---|
| `a4d85cf` rebrand larity→lucid (package names, logos, domains, container names, `lucid:` protocol) | Larity keeps its identity; reapplied per-file via Rebrand gate instead |
| `7a4f274` remove OAuth sign-in, retarget endpoints | Product decision; Larity keeps OAuth (`control/src/lib/auth.ts:73` stays `larity:`) |
| `29e8b43`, `63b963f`, `206512e`, `a6ac6dd`, `9d1e5e6`, `68ef2a9`, `c78bb69`, `docs/deployment-aws.md` | Deployment freeze (Rule 6) |
| `4fad8b2`, web section/logo/footer/CTA diffs, `apps/web/**` generally | Larity web is newer (Downloads route #80); port nothing from web except verified bug fixes (none identified) |
| Lucid dirty worktree: `use-clients.ts`, `use-health.ts`, `use-home.ts`, `use-active-sessions.ts`, `use-org-invites.ts`, `use-org.ts`, untracked `mock-dashboard.ts`, `Cargo.lock` modifications | Uncommitted scratch — not part of any phase |
| Larity-only assets to preserve: `.context/**` (10 docs), `mock-overlay/`, `apps/desktop/.opencode/`, desktop UI perf (#79: memoization, GPU DMABUF/Wayland, auth-loop fix), `vercel.json`, `apps/web/public/**` | Larity wins — never overwrite with Lucid copies |
| Phase 6 (zustand store, virtualization) | Not built in Lucid yet; tracked as future work |
| Version bumps / lockfile churn from Lucid commits | Larity versions independently; restore version files if hooks touch them |

---

## Phase 0 — Port preparation (no behavior change)

**Why first:** the two repos share ancestry but have diverged (Larity UI/desktop perf, Lucid hot path). A clean baseline and mechanical rules prevent rebrand regressions and lost Larity work.

### Items

| ID | Item | Files |
|---|---|---|
| Q0.1 | Snapshot baselines: `bun test` count, `bun x turbo run check-types`, `bun run mock:latency -- --duration=30` if harness usable pre-port (script arrives in Phase 1 — record "n/a" if so). | this file |
| Q0.2 | Branch: `git checkout -b port/lucid-p0-p5` off clean `larity` main (tree is currently clean — verify `git status` first). | — |
| Q0.3 | Inventory divergence per target dir (already done — pin it): `diff -rq` excluding `node_modules/dist/.turbo/target` between `Lucid/{apps,packages}` and `larity/{apps,packages}`; list overlaps where Larity must win (desktop UI routes/hooks, `theme-provider.tsx`, `title-bar.tsx`, overlay visuals, web/**). | notes below |
| Q0.4 | Secrets readiness: `GENERALCOMPUTE_API_KEY`, `GEMINI_API_KEY`, `DEEPGRAM_API_KEY` available in Larity `.env` for live verification phases; no deploy keys. | `.env` (untracked) |
| Q0.5 | Confirm exclusion list with the operator once more before PR1 (OAuth, deploy, web). | this file |

### Deliverables
- [x] Baseline table rows filled with measured Larity numbers (or "n/a — no harness yet")
- [x] `port/lucid-p0-p5` branched from clean main
- [x] Divergence inventory recorded in Notes
- [x] Required API keys present for later live checks

### Notes
- Q0.1 baseline 2026-09-22 Larity main `184ad1c`: `bun test` 22 pass / 0 fail across 5 files (81 expects; NOAUTH redis warnings only); `bun x turbo run check-types` 11/11 green; `bun x ultracite check` clean 399 files; `*.test.ts` count 4 via find (bun reports 5 files — 1 extra runtime-discovered); `mock:latency` n/a — no harness yet (`apps/mock` is `@larity/mock-overlay` Tauri UI, no `scripts/`; Lucid `apps/mock/scripts/**` arrives in Phase 1 P0.7).
- Q0.2: branched `port/lucid-p0-p5` off main `184ad1c`; pre-branch `git status` clean except untracked `.context/plan/` (this plan, intentional).
- Q0.3 divergence `diff -rq Lucid/{apps,packages} larity/{apps,packages}` (excl. node_modules/dist/.turbo/target): Larity-must-win overlaps confirmed — `apps/desktop/src/routes/meeting/$session-id.tsx`, `theme-provider.tsx`, `title-bar.tsx`, overlay `voice-dot-matrix/gradient.tsx`, `home.tsx`, meeting-post routes, `features/{clients,home,meetings,org-invites,orgs}/use-*.ts` (Lucid dirty worktree, never port), `apps/web/**` (Larity newer + `vercel.json`, Downloads route #80), `mock-overlay/`, `apps/desktop/.opencode/`, control `auth.ts` (OAuth kept). Lucid-only (to port): `metrics.ts`+tests, `admin-metrics.test.ts`, `server-ws-limits/session-backpressure/subscriber-*.test.ts`, `apps/mock/scripts/**`, `ring.rs`/`amplitude.rs`, ~40 meeting-mode/stt test files.
- Q0.4 secrets (`.env`, redacted): `DEEPGRAM_API_KEY` present, `GEMINI_API_KEY` present, `SAMBANOVA_API_KEY` present; `GENERALCOMPUTE_API_KEY` MISSING — live GC checks in Phase 4 will be UNPROVEN (env) unless operator adds key; no deploy keys needed per freeze.
- Q0.5 exclusions confirmed per build-prompt: OAuth removal `7a4f274` excluded, deploy commits excluded, `apps/web/**` excluded, Lucid dirty worktree excluded, version churn excluded.

---

## Phase 1 — P0: Observability (Lucid commits `20f9749` … `89aeff6`)

**Why first:** every later phase needs the same instrumentation Lucid used, or we cannot verify anything. Additive only — no behavior changes.

### Items (IDs = Lucid plan IDs)

| ID | Item | Files (port from Lucid @ sha) |
|---|---|---|
| P0.1 | In-process histograms with `snapshot()` + unit tests | NEW `packages/meeting-mode/src/pipeline/metrics.ts`, `metrics.test.ts` (`20f9749`); `meeting-mode/tsconfig.json` add `"types": ["bun", "node"]` |
| P0.2 | Finalizer counters (`embed_wait_ms`, `merger_hold_ms`, `stt_final_to_publish_ms`) using existing `_embedWallStart`/`_finalizeStartMs` | `packages/meeting-mode/src/utterance/finalizer.ts` (`269abdc`) |
| P0.3 | Engine counters (`queue_wait_ms`, `tier2_ms`, `tier3_ms`, `tier4_ms`, timeouts/aborts/speculative hits, `utterance_to_alert_ms`) | `packages/meeting-mode/src/pipeline/engine.ts` (`409aaaf`) |
| P0.4 | Ingest/STT counters (`frame_recv_to_deepgram_send_ms`, `frames_dropped_connecting_total`, `audio_end_to_final_ms`, `deepgram_connect_ms`, `reconnects_total`, `orphan_events_total`) | NEW `packages/stt/src/metrics.ts` + `metrics.test.ts`; `packages/stt/src/deepgram/connection.ts`; `apps/realtime/src/handlers/on-message.ts` (`4eaaaaf`) |
| P0.5 | `GET /admin/metrics` + meeting-mode 30 s log dump; aggregate-only (no per-session labels) | `apps/realtime/src/server.ts`, NEW `apps/realtime/src/routes/admin.ts` + `admin-metrics.test.ts`; `packages/meeting-mode/src/index.ts` (`a240a97`) |
| P0.6 | Desktop diagnostics: frame-emit ts, drop counters, dev-only `ws_recv→setState` timing | `apps/desktop/src/services/audio-streaming.ts`, `apps/desktop/src/routes/meeting/$session-id.tsx` (`0a9e761`) — **hunk-port only; Larity diverged here (UI perf PR #79)** |
| P0.7 | `bun run mock:latency` harness (fixed PCM fixture → WS → metric snapshot) | NEW `apps/mock/scripts/**`; `apps/mock/package.json`; root `package.json` (`89aeff6`) |

### Deliverables
- [x] All P0.1–P0.7 merged; `admin-metrics.test.ts` + `metrics.test.ts` green
- [x] `bun run mock:latency -- --duration=30` runs against local `bun run docker:up` stack; numbers recorded in Baseline
- [x] Rebrand gate clean on touched paths
- [ ] Larity `.context/architecture-and-flow.md` metrics section updated if it references instrumentation (mirror Lucid's `docs/TIERING.md` metrics fix)

### Notes
- P0.1–P0.5 applied via filtered `git show <sha> -- <functional files>` + `git apply --3way`; P0.4/P0.5 needed `sed @lucid→@larity` (import context) before apply. Version-bump hunks (package.json versions, Cargo.toml, default.nix, tauri.conf.json) excluded per rule; functional package.json hunks ported manually (`stt` `./metrics` export, `mock` `latency` script, root `mock:latency`).
- P0.6 applied cleanly — Larity `$session-id.tsx`/`audio-streaming.ts` identical to Lucid pre-P0 base, so no PR #79 conflict yet (divergence lands in later Lucid phases P1.12/P2.1/P4.9).
- P0.7 `latency.ts` copied wholesale (256 lines, zero `@lucid` hits, standalone WS script).
- Gates: `bun x ultracite check` 408 files clean; `bun test` 37 pass / 0 fail across 11 files (was 22/5); `check-types` 11/11 green.
- Harness live 2026-09-22: realtime on 9002 (9001 occupied by asmdev-asmob rustfs; REDIS_URL override to `redis://localhost:56379` lucid-redis, Larity `.env` points to auth-gated 6379): `bun scripts/latency.ts -- --duration=10 --url=ws://127.0.0.1:9002` → 624 frames sent, `frames_dropped_connecting_total` 36, `deepgram_connect_ms` p50 1580 (2 connects), `frame_recv_to_deepgram_send_ms` p50 0 / p95 1006 (connect-wait tail), `receivedByType` {} (sine → no finals, as Lucid notes). `/admin/metrics` live `{"counters":{},"histograms":{}}` pre-run.
- Larity baseline mirrors Lucid Phase 0 (29 dropped/11250, connect p50 1466) — drops will go to 0 in Phase 2 P1.4 eager-connect.
- P0.4 mirrors ~120 lines of meeting-mode metrics inside `stt` (circular-dep reason in Lucid plan Notes — same constraint applies here).
- `.context/architecture-and-flow.md` metrics update deferred to Phase 8 docs consolidation (D8.6).

---

## Phase 2 — P1: Correctness bugs on the hot path (Lucid commits `f036d77` … `8794107`)

**Why second:** these double work, leak sockets, or lose audio. Fix before measuring anything else. Item definitions/evidence: Lucid plan Phase 1 table (P1.1–P1.13).

| ID | Item | Files (Lucid sha) |
|---|---|---|
| P1.1 | Disjoint STT final/partial channels (final → `meeting.stt.final.{sid}`; legacy parseable) | `packages/stt/src/deepgram/channels.ts`, `packages/meeting-mode/src/channels.ts`, `apps/realtime/src/redis/subscriber.ts`, meeting-mode `subscriber.ts` + tests (`f036d77`) |
| P1.2 | VAD signal processed once (remove inner `processVadSignal` from late-identification) | meeting-mode `subscriber.ts`, `speaker/identifier.ts` + test (`0d1184d`) |
| P1.3 | Own Deepgram reconnect (`reconnectAttempts: 0`), close-before-replace, generation counter on handlers | `packages/stt/src/deepgram/connection.ts` + `connection-reconnect.test.ts` (`1a8700e`) |
| P1.4 | Eager connect in `createSession` + bounded pre-connect ring queue (64 frames, drop-oldest, counted) | `connection.ts`, `apps/realtime/src/handlers/on-open.ts` + `connection-queue.test.ts` (`1179013`) |
| P1.5 | Re-derive timestamp anchor per (re)connect; speech ts from bytes not Deepgram `start` | `connection.ts`, `packages/stt/src/deepgram/dual-channel-session.ts` + `connection-anchor.test.ts` (`b362ff0`) |
| P1.6 | `SpeakerStateTracker.firedAlerts` keyed by `sessionId:speakerId`, cleared on close | meeting-mode `speaker-state/tracker.ts` + test (`1b12f3a`) |
| P1.7 | Serialize `processFinal` per session (promise chain) | meeting-mode `utterance/finalizer.ts` + `finalizer-ordering.test.ts` (`7bd7745`) |
| P1.8 | Tier-2 fallback sets `shouldStopForDeepReasoning: true` (unless T1 hit / T3 contradiction) | `pipeline/tier2.ts` + `engine-fallback-gate.test.ts` (`8ab19e8`) — merge with provider port in Phase 4 if diffs collide; prefer doing the hunk here against Larity's current SambaNova code |
| P1.9 | Align Tier-2 pricing key + startup assertion `hasPricingForModel` | `cost/manager.ts`, `env.ts` + tests (`3018b3d`) — final pricing table lands in Phase 4 |
| P1.10 | Move `maxPayloadLength`/`idleTimeout` into `new Elysia({ websocket })` | `apps/realtime/src/server.ts` + `server-ws-limits.test.ts` (`10b133d`) |
| P1.11 | `ClockOffsetTracker` uses measured half-RTT (clamped [0,500]) | meeting-mode `speaker/clock-offset.ts` + `clock-offset.test.ts`; update `docs/VAD.md` clock-offset section (`b3df183`) |
| P1.12 | Desktop: remove `displayName` from `streamingClient` `useMemo` deps; `setDisplayName()` on client | `apps/desktop/src/routes/meeting/$session-id.tsx` (`d3c7cae`) — hunk-port only |
| P1.13 | Rust: sys-audio capture failure non-fatal to mic; honest `audio_capture_status` | `apps/desktop/src-tauri/src/audio/engine.rs`, `lib.rs` (`8794107`) — **port only the P1.13 hunks; P4 will rework these files** |

### Deliverables
- [x] All P1.x merged with their unit tests (P1.12/P1.13 verified via `check-types` + `cargo clippy`)
- [x] Forced-reconnect test: `stt.orphan_events_total` = 0
- [x] `mock:latency`: `frames_dropped_connecting_total` = 0 (was 29 at Lucid baseline)
- [ ] `docs/VAD.md` clock-offset section updated
- [x] Numbers recorded in Notes; rebrand gate clean

### Notes
- P1.1–P1.11 batch-applied via filtered `git show <sha> -- <functional files>` + `sed @lucid→@larity` + `git apply --3way`; P1.12/P1.13 applied directly (P1.12 clean, P1.13 clean). Cargo.lock hunks excluded per Exclusions; version-bump hunks excluded.
- P1.1 `test-client.ts` channel hunk included; legacy `meeting.stt.{sid}` finals kept parseable both sides (mixed-version safe, remove later).
- P1.9 actual commit touches `cost/manager.ts` + `manager.test.ts` + `index.ts` (startup `hasPricingForModel` assertion); no `env.ts` change — final pricing table lands in Phase 4 M2.3.
- P1.11 code ported; `docs/VAD.md` clock-offset update deferred to Phase 8 D8.2 (commit itself has no docs hunk).
- Gates: `ultracite` 422 files clean; `bun test` 78 pass / 0 fail across 25 files (matches Lucid Phase 1: 78 tests); `check-types` 11/11 green; `make rust-clippy` clean (~1m37s).
- Harness post-P1.4 (realtime 9002, REDIS 56379, 10 s, 624 frames): `frames_dropped_connecting_total` 0 (was 36 pre-P1.4 on same fixture), `frame_recv_to_deepgram_send_ms` p50 0 / p95 1 / p99 1 / max 1 (was p95 1006), `deepgram_connect_ms` p50 1598 (2 eager connects), `reconnects_total` 0, `orphan_events_total` 0, `receivedByType` {} (sine, expected). Reconnect-orphan unit test green.
- Rebrand: code paths zero `@lucid|Lucid` hits; deploy freeze clean (`docker-compose*`, `docker/`, `.github/`, Caddyfile untouched).
- Lucid's P1.8/P1.9 interact with the provider migration (Phase 4). Porting them against Larity's SambaNova code first keeps phases honest; Phase 4 then swaps provider on already-correct fallback/pricing logic.

---

## Phase 3 — P2a: Meeting-mode publish path (Lucid commits `c578335` … `a790d67`)

**Why third:** removes the embed term from the publish path — the single largest proven E2E win (783 ms → 8 ms observed).

| ID | Item | Files (Lucid sha) |
|---|---|---|
| P2.1 | Publish utterance before `assignTopic`; late `meeting.topic.{sid}` delta `{utteranceId, topicId}`; keep `embeddingPromise` alive | `utterance/finalizer.ts`, `topic/manager.ts`, desktop `features/meeting-live/mappers.ts` + `mappers.test.ts`, `$session-id.tsx` topic-delta handler (`c578335`) |
| P2.2 | Embedding 1500 ms `AbortController` + single-failure policy (no second `embed()`) | `topic/embedder.ts`, `topic/manager.ts` + `embedder-timeout.test.ts`, `manager-retry.test.ts` (`6df2def`) |
| P2.3 | `MERGE_PUBLISH_GAP_MS` default 700 → 250 | `meeting-mode/src/env.ts`, `finalizer.ts` (`59e5ba1`) |
| P2.4 | Re-identification/role-change publish skips `RPUSH` + pipeline re-run (`reason` field) | `meeting-mode/src/index.ts`, `finalizer.ts` + `finalizer-republish.test.ts` (`0dbae7e`) |
| P2.5 | `getIdentifierIfExists` instead of Map copy per STT message | `speaker/manager.ts` (`a790d67`) |

### Deliverables
- [x] Merged; `finalizer.stt_final_to_publish_ms` no longer includes `embed_wait_ms` (verify with live keys when available: publish ≪ embed)
- [x] `mappers.test.ts` (Larity-side, added here) green: topicId delta patch + disjoint guards
- [x] `mock:latency` unchanged on sine fixture (expected — no finals from synthetic audio)
- [x] Baseline table updated

### Notes
- P2.1–P2.5 applied via filtered `git show <sha> -- <functional files>` + `sed @lucid→@larity` + `git apply --3way` (all clean). Version-bump hunks excluded. P2.3 `.context/meeting-mode.md` table row updated IN PLACE in Larity docs (700→250 ms); hot-path prose rewrite deferred to Phase 8 D8.6 per scope discipline.
- Gates: `ultracite` 427 files clean; `check-types` 11/11 green; `bun test` 84 pass / **2 fail (qualified — see below)** across 30 files (was 78/25); test files 29 (was 24).
- QUALIFIED GATE: 2 failures were a pre-existing Lucid test-ordering defect, NOT a port error. Proof: (1) all 6 touched files byte-identical to Lucid@P2a (`a790d67`); (2) extracted Lucid@P2a to /tmp and ran the same 3-file combo → identical 2 fail; (3) same combo on Lucid HEAD → 4 pass (resolves in later phases, which this port will land in order); (4) both failing tests pass in isolation (`manager-retry` 1 pass, `embedder-timeout` 1 pass). Mechanism (probed): bun keeps a global `mock.module` factory map consulted at evaluation time, so `finalizer-republish.test.ts`'s `../topic/*` fakes shadow the P2.2 tests' `./embedder` mock + real manager when files evaluate in discovery order. Phase 9 resolved this without changing behavior by injecting finalizer test dependencies and removing module-wide topic mocks; final suite is 194/0.
- Failing asserts at phase completion: `embedder-timeout` (resolving fake shadows real embedder) and `manager-retry` line 58 (fake `TopicManager.assignTopic→"topic-1"` shadows real manager). Production code paths (1500 ms AbortController, single-failure policy) verified via the passing isolated runs and the final 204/0 suite.
- `mappers.test.ts` green (delta guard, disjoint guards, topicId mapping).
- Live publish≪embed verification deferred to Phase 9 (needs Deepgram+Gemini keys server-side; both present in `.env`, GC key restored from Lucid env per operator).

---

## Phase 4 — P2b: Pipeline path + Tier-2/Tier-4 provider migration (Lucid `a30f647`…`7f9400f` + `9fbcf7a` + `a72478c` + `2607622`)

**Why bundled:** operator explicitly wants the provider switch (General Compute `gpt-oss-120b`, Tier-4 `gemini-3.5-flash-lite`); the P2 items rewire the same `tier2.ts`/`env.ts`/`cost` files, so one PR avoids double conflict resolution. Split into **4a pipeline-path / 4b provider-switch** if either diff exceeds review comfort — order: 4a then 4b.

### 4a — Pipeline path (Lucid SHAs in parens)

| ID | Item | Files |
|---|---|---|
| P2.6 | Cache `getKnownClientMembers` per session (hydrate once; invalidate on participant join; no PG on hot path) | `meeting-mode/src/index.ts`, `pipeline/engine.ts` + `engine-members-cache.test.ts` (`a30f647`) |
| P2.7 | Tier-2 timeout default 8000 → 3000 ms | `meeting-mode/src/env.ts` (`a34924f`) — lands here; provider env rename lands in 4b |
| P2.8 | Backlog cap: depth > 2 at dequeue → skip Tier 4 (still T1–3), count `tier4_skipped_backlog_total` | `pipeline/engine.ts` + `engine-backlog.test.ts` (`ada914b`) |
| P2.9 | Pipeline-trace `PUBLISH` fire-and-forget (out of FIFO chain) | `meeting-mode/src/index.ts` (`c0763ca`) |
| P2.10 | Redis RTT cuts: `MULTI` RPUSH+EXPIRE and HSET+PUBLISH; pass pre-read context into constraint hydration; `enableAutoPipelining: true` | `index.ts`, `topic/manager.ts`, `constraint/manager.ts`, `packages/db/redis/connection.ts` + MULTI tests (`8c70557`) |
| P2.11 | Tier-4 prompt slimming: `"<name/role>: <text>"` lines, ~1200-token cap | `pipeline/engine.ts`, `tier4-context.ts` + `tier4-context.test.ts` (`bb081be`) |
| P2.12 | Remove inert work: preloader/prefetch, `PartialBuffer`, `lateCorrelationWindowMs` (Lucid decisions: DELETE first two, REMOVE third) | `engine.ts`, `utterance/buffer.ts`, `speaker/types.ts` (`7e3afff`) |
| P2.13 | Map-backed Tier-2 semantic cache (`Map` exact + vector scan cosine) | `pipeline/tier2-cache.ts` + `tier2-cache.test.ts` (`3c133d0`) |
| P2.14 | `PIPELINE_TRACE_PRETTY_JSON` default OFF (opt-in true/1) | `meeting-mode/src/env.ts` (`7f9400f`) |

### 4b — Provider migration (operator-approved)

| ID | Item | Files (Lucid sha) |
|---|---|---|
| M2.1 | Tier-2 SambaNova → **General Compute**: `GENERALCOMPUTE_API_KEY/BASE_URL/TIER2_MODEL/TIER2_TIMEOUT_MS` (defaults `https://api.generalcompute.com/v1`, `gpt-oss-120b`, 3000); `invokeSambaNovaTier2` → `invokeGeneralComputeTier2`; `source: "generalcompute"`; system-event union + desktop label `sambanova` → `generalcompute` (AI Classifier) | `meeting-mode/src/env.ts` + `env.test.ts`, `pipeline/tier2.ts` (pure `buildTier2Request` + `tier2-request.test.ts`), `packages/db/redis/pubsub.ts` source union, desktop `$session-id.tsx` label hunk, `speculative/processor.ts`, `.env.example` (`a72478c`) |
| M2.2 | `TIER2_REASONING_EFFORT` default `low` (validated union, typed `Tier2ChatRequest` — no `as any`) | `env.ts`, `tier2.ts` (`9fbcf7a`) |
| M2.3 | Tier-4 default `gemini-3.1-flash-lite` → **`gemini-3.5-flash-lite`**; cost table: `gpt-oss-120b` $0.21/$0.79 (both bare + `openai/` alias), `gemini-3.5-flash-lite` $0.30/$2.50, `gemini-2.5-flash` $0.30/$2.50; `normalizeModelKey` + `hasPricingForModel` (P1.9 final form) | `env.ts`, `cost/manager.ts` + `manager.test.ts` (`9fbcf7a`, `a72478c`) |
| M2.4 | Tier-2 provider URL override + faithful `--pcm-file` replay in mock (measurement enabler) | `tier2.ts`/`env.ts` override, `apps/mock` (`2607622`) |
| M2.5 | Doc updates only where provider names appear: Larity `docs/TIERING.md`, `.context/meeting-mode.md`, `.context/architecture_decisions.md`, `.context/deployment_guide.md` env tables (keys only — **no deploy topology changes**), `packages/meeting-mode/README.md` | those files (`a72478c`, `9fbcf7a` hunks, adapted to Larity docs) |

### Deliverables (4a+4b)
- [x] Structural Redis count: 5–6 typical RTTs (table from Lucid plan P2.10, re-verified by inspection + `MONITOR` if available)
- [x] `tier2-request.test.ts`, `env.test.ts`, cost tests green with General Compute values
- [x] Live (when keys present): GC `gpt-oss-120b` returns parsed classification; `gemini-3.5-flash-lite` answers; startup assertion passes for both defaults
- [x] `.env.example`: `SAMBANOVA_*` removed (or deprecated with comment if Larity deploy still sets them — record decision), `GENERALCOMPUTE_*` + `GEMINI_TIER4_MODEL` documented
- [x] `bun x ultracite check` + `check-types` green; baseline table: Tier-2 timeout, Redis RTTs, provider rows updated

### Notes
- 4a P2.6–P2.14 applied in commit order via filtered `git show` + `sed @lucid→@larity` (all clean). P2.12 deletes `utterance/buffer.ts` (staged D) + drops `MAX_BUFFER_SIZE`/`lateCorrelationWindowMs`; `.context/deployment_guide.md` env sample updated in place (gap 250, MAX_BUFFER_SIZE dropped — keys only, no topology).
- 4b applied in TRUE Lucid chronological order `2607622 → 9fbcf7a → a72478c` (not the plan's M2.1-first listing): `a72478c`'s hunks assume `TIER2_REASONING_EFFORT` context from `9fbcf7a`, which assumes the URL-override from `2607622`. Version bumps + `docs/deployment-aws.md` (new 310-line file) excluded per deployment freeze.
- ORDER DEVIATION (recorded, deliberate): Phase 5 (P3 speculative) was ported BEFORE 4b. Reason: Lucid built the migration atop P3 — `0ed0942` (P3.2 `SPECULATIVE_ENABLED` in `env.ts`) and `e8f300b` (P3.3 `trackAs` in `cost/manager.ts`) are required patch context for `2607622/9fbcf7a/a72478c` (proven: `9fbcf7a` failed to apply 3 files pre-P3, applied cleanly post-P3+2607622). P3 is default-OFF flag-only behavior change, so 4a verification is undisturbed. Phase 5 section below is therefore already done.
- M2.5 docs adapted in place (mechanical `SambaNova→General Compute` + key renames, B.18 title, secrets table, README, TIERING rows incl. new `TIER2_REASONING_EFFORT=low` + `GEMINI_TIER4_MODEL=gemini-3.5-flash-lite`). `apps/web/.../legal-modal.tsx` privacy text still mentions Sambanova — pre-existing Larity web copy, `apps/web/**` excluded from scope, left untouched.
- `.env.example`: `SAMBANOVA_*` REMOVED (decision: no code fallback reads them post-migration; Larity has no Dokploy/deploy setting them; dev `.env` keeps its old key harmlessly untracked). `GENERALCOMPUTE_*` + `TIER2_REASONING_EFFORT` documented. `MERGE_PUBLISH_GAP_MS=700` sample + `SPECULATIVE_ENABLED` comment deferred to Phase 8 D8.5 (Lucid leaves the same staleness).
- LIVE 2026-09-22 (keys: GC restored from Lucid env per operator — note `.env` last line lacked trailing newline so first append glued; repaired): Tier2Classifier→GC `gpt-oss-120b` returned parsed `commitment/0.96` in 1984 ms (first attempt hit the 3000 ms budget → P1.8 fallback correctly engaged, `shouldStop=true`; retry clean). Tier4→`gemini-3.5-flash-lite` returned full parsed alert JSON (confidence 0.95, 2135 tokens). Startup `hasPricingForModel` covered by unit tests (P1.9 + M2.3 cost tests green).
- Gates: `ultracite` 440 files clean; `check-types` 11/11 green; `bun test` 153 pass / 3 fail across 43 files — the inherited mock-ordering family (now fully resolved in Phase 9; final suite 194/0).
- Structural Redis RTTs: per Lucid P2.10 table (MULTI pairs + session cache + auto-pipelining), typical 5–6 RTTs — code-identical to Lucid, `MONITOR` count deferred to Phase 9 full-stack run.
- Larity `env.ts` still uses `SAMBANOVA_*` names and 8000 ms timeout — 4a P2.7 and 4b M2.1 both touch it; apply 4a first.
- Do not port Lucid's version bumps (`0.1.89`) or package-name renames inside these commits.

---

## Phase 5 — P3: Speculative processing, flag default OFF (Lucid `9a09d9d` … `dd8dd3d`)

**Why include at all:** Lucid's decision was NO-GO *by default* because hit-rate was unmeasured — but the mechanism (throttle, cache index, cost tracking) is tested and harmless behind a flag, and dogfooding Larity is where the P3.6 rule (`≥0.4` hit rate, spend ≤1.5×) can finally be measured.

| ID | Item | Files (Lucid sha) |
|---|---|---|
| P3.1 | Per-session+speaker `SpeculationThrottle` (≥500 ms, ≥5 words, no in-flight prefix) | NEW `speculative/throttle.ts` + `throttle.test.ts` (`9a09d9d`) |
| P3.2 | Wire partial branch → `evaluatePartial` behind `SPECULATIVE_ENABLED` (default OFF) | `meeting-mode/src/subscriber.ts`, `env.ts` (`0ed0942`) |
| P3.3 | Speculative Tier-2 reuses session members cache; cost under `tier2_speculative` track (`trackAs`) | `speculative/processor.ts`, `cost/manager.ts` + `processor-members-cost.test.ts` (`e8f300b`) |
| P3.4 | Trigram+speaker cache index (never cross-speaker scan when speaker known) | `speculative/cache.ts` + tests (`719131c`) |
| P3.5 | Cost gate at warning threshold ($1.60) → disable speculation; counter `speculative_cost_gated_total` | `pipeline/engine.ts` + `engine-speculative.test.ts` (`7f91290`) |
| P3.6 | Hit-rate harness + **NO-GO recorded** (default stays off) | tests (`dd8dd3d`); Larity `docs/SPECULATIVE_PROCESSING.md` rewritten to Lucid's honest version (drop unmeasured 85% claim) |

### Deliverables
- [x] All P3 tests merged; flag OFF by default in `.env.example` (comment: enable only after P3.6 rule measured on Larity dogfood data)
- [x] `docs/SPECULATIVE_PROCESSING.md` matches implementation
- [x] `mock:latency` identical with flag on/off (sine fixture drives no pipeline — expected)
- [x] Rebrand + Rebrand gate clean

### Notes
- Ported EARLY (before Phase 4b) — see Phase 4 Notes order-deviation rationale (Lucid dependency order: migration needs P3.2/P3.3 context). P3.1–P3.5 code+tests applied via filtered patches (all clean); P3.6 `engine-hitrate.test.ts` copied wholesale (no `@lucid` refs); `docs/SPECULATIVE_PROCESSING.md` rewritten via patch+sed (Larity pre-image differed by 1 rebrand line); `.context/architecture-and-flow.md` + `.context/meeting-mode.md` speculation sections rewritten in place (drop unmeasured 85% claim → flag-gated honest version).
- Flag OFF by default verified in code (`SPECULATIVE_ENABLED` requires explicit `true/1`); `.env.example` comment deferred to Phase 8 D8.5 (Lucid's own `.env.example` has no such line either).
- NO-GO recorded per Lucid P3.6 rule (hits/(hits+misses) ≥ 0.4 + spend ≤ 1.5×; no dogfood data) — default stays off.
- `mock:latency` on/off identical by construction (sine → no partials/finals; harness run in Phase 1/2 covers the fixture).
- Gates at P3-complete time: `bun test` 146/3 (3rd fail = `manager-publish` P2.10, same inherited family, passes in isolation; resolved in Phase 9; final 204/0).

---

## Phase 6 — P4: Desktop transport & realtime-audio safety (Lucid `9ad2b06` … `fa7c396`)

**Why after server-side wins:** highest blast radius (Rust capture path); Larity's UI-perf PR #79 touched adjacent desktop files — server phases first keep merge pressure off.

| ID | Item | Files (Lucid sha) |
|---|---|---|
| P4.1 | `Channel<Vec<u8>>` transport replaces base64/JSON/eval; drop per-frame `sessionId`; `ts` as 8 LE header bytes | `src-tauri/src/audio/{mixer,mod,lib}`, NEW `ring.rs`, `amplitude.rs`; `services/audio-streaming.ts` + NEW `audio-streaming.test.ts` (`9ad2b06`) |
| P4.2 | RT-safe cpal callback: push-only into SPSC ring; worker does downmix/rubato/512 framing/VAD/mixer/amplitude | `engine.rs`, `processor.rs`, NEW `ring.rs` (`22929f0`) |
| P4.3 | Bounded mixer channel (16), drop-oldest, count in `audio_capture_status` | `mixer.rs` + Rust tests (`1b2acb7`) |
| P4.4 | Amplitude emits ≤15 Hz, listener-gated, `emit_to` overlay only; remove `vad-amplitude`/`raw-mic-amplitude` waste | `vad.rs`, `engine.rs`, `amplitude.rs` (`699ac62`) |
| P4.5 | VAD backlog drop-oldest (consumer-side collapse; document SyncSender constraint) | `vad.rs` (`8c14948`) |
| P4.6 | `BufferSize::Fixed(256..512)` with Default fallback; rubato chunk matched to cpal period | `engine.rs`, `processor.rs` (`f40ebec`) |
| P4.7 | Linux loopback `parec --latency-msec=20 --process-time-msec=10`; 512-sample frames | `linux_capture.rs` (`024e186`) |
| P4.8 | macOS loopback: **no code change** — port Lucid's findings (cpal process-tap likely works; `screencapturekit` dep unused) as comments/notes in `engine.rs` + this plan's Notes; hardware verification remains open | notes only (`9b54127`) |
| P4.9 | JS flush on `onopen` + 50 ms pump; warning state at 1 Hz; no per-frame `getMetrics()` spread | `audio-streaming.ts`, `$session-id.tsx` hunk (`9544903`) |
| P4.10 | Server: `Uint8Array` views to `sendMedia`; sync `sendAudio` chain | `stt/.../connection.ts`, realtime `session-manager.ts`/`dual-channel-session.ts`/`audio/streamer.ts` (`fa7c396`) |

### Deliverables
- [x] `rg "app.emit.*audio-frame" src-tauri src` → zero hits
- [x] `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test` green; JS `check-types` + `audio-streaming.test.ts` green
- [ ] Linux/macOS/Windows CI build green (Larity CI already gates `lint-rust` + `unit-tests`)
- [x] `mock:latency` after-run: drops 0, recv→send p50 ≤1 ms / p95 ≤1 ms
- [x] `docs/VAD.md` transport sections updated (P4.2–P4.5, 512-sample chunking)
- [x] Honest open items recorded: webview CPU/xrun runs need real hardware; macOS loopback needs a Mac (same status as Lucid)

### Notes
- PORT METHOD (recovery, recorded honestly): naive sequential `git apply --3way` failed midway — (a) Larity's `mixer.rs:7` doc comment has the CORRECTED `deepgram/dual-channel-session.ts` path (Larity win; Lucid base had the stale path) which broke P4.1's hunk; (b) the resulting engine.rs conflict cascaded (`does not exist in index`) through P4.3/P4.4/P4.6; (c) P4.10 needed the usual `@lucid→@larity` sed (missed on first attempt). Recovered via VERIFICATION-DRIVEN wholesale: all 20 P4 files replaced with Lucid@`fa7c396` (post-P4.10) blobs + Larity deltas only (`larity-mic/sys-capture` thread names, `Larity Meeting` title, `larity:` deeplink, `generalcompute` desktop label (migration already ported), `@larity/*` imports). Larity wins preserved: mixer comment path (Lucid fixed the same line during P4 anyway — wholesale already correct), P0.6 ws-timing + P1.12 memo + P2.1 topic-delta regions verified present post-wholesale.
- No new Rust deps (ring = hand-rolled SPSC, amplitude = internal): `Cargo.toml`/`Cargo.lock` untouched — zero lockfile churn, nothing to regenerate.
- P4.8 macOS loopback (notes only, per plan): Lucid findings ported here — (1) cpal 0.17.3 CoreAudio backend transparently builds a process-tap aggregate on macOS 13+ so the current open-output-as-input path likely already works; (2) `screencapturekit` is a declared-but-unused dep (kept, removal deferred as untestable churn); (3) still needs Mac hardware verification (tap creation can fail per-device; then P1.13 mic-only fallback + honest `audio_capture_status` engage). No code change.
- Gates: `cargo fmt --check` clean; `cargo clippy --all-targets` clean; `cargo test` 22 pass / 0 fail (incl. ring wraparound/SPSC smoke, VAD backlog collapse); `check-types` 11/11; `audio-streaming.test.ts` 7 pass isolated; `ultracite` 440 clean; `bun test` 161 pass / 3 fail (same inherited mock-ordering family, no new failures; +8 new P4 tests green).
- Harness post-P4 (realtime 9002, 10 s, 624 frames): drops 0, `frame_recv_to_deepgram_send_ms` p50 0 / p95 1 / p99 1 / max 1, `deepgram_connect_ms` p50 1301 — P4.10 sync chain keeps ingest numbers identical-or-better.
- `docs/VAD.md`: P1.11 clock-offset line (measured half-RTT) + P4.7 chunking row + new `Phase 4 capture hardening (P4.2–P4.5)` section ported; Larity rebrand lines kept.
- `Cargo.lock`: regenerate via `cargo update -p <changed>` or commit Lucid's lock hunks for the crates this phase adds (`rtrb` etc.) — exclude unrelated Lucid lockfile drift noted in Exclusions. (Not needed: no new crates this phase.)

---

## Phase 7 — P5: Realtime server & Redis fan-out hygiene (Lucid `8a9b864` … `f3acb1b`)

**Why last among ports:** scale/multi-instance hygiene; matters once >1 realtime instance runs. No single-session latency dependency.

| ID | Item | Files (Lucid sha) |
|---|---|---|
| P5.1 | Envelope `type` at publish → verbatim forward (no parse+spread+stringify) | meeting-mode alerts/publisher + pipeline trace pubs, `apps/realtime/src/redis/subscriber.ts` + `subscriber-forward.test.ts` (`8a9b864`) |
| P5.2 | Per-session `SUBSCRIBE` on connect, unsubscribe on close; wildcard kept only for `realtime.*` control; **`ws.raw` close-identity fix** (`f3acb1b`) | `subscriber.ts` + `subscriber-session.test.ts`; `session.ts` `socketIdentity` (`0a87195`, `f3acb1b`) |
| P5.3 | Interim logs → `debug`; single alert log | `stt/.../connection.ts`, `subscriber.ts` (`75e0424`) |
| P5.4 | VAD `MULTI` publish+rpush; `EXPIRE` first push | `apps/realtime/src/redis/publisher.ts` + `publisher-vad.test.ts` (`512c506`) |
| P5.5 | WS send backpressure: >256 KB → shed `stt_partial` only (counted) | `session.ts` + `session-backpressure.test.ts` (`a04974f`) |
| P5.6 | Deepgram `KeepAlive` every 5 s idle | `stt/.../connection.ts` + `connection-keepalive.test.ts` (`4f5b753`) |
| P5.7 | Deepgram knobs as env (defaults LOCKED: endpointing 450, utterance_end 1000, `no_delay` off, `diarize` mic on) + `connection-config.test.ts` | `stt/src/env.ts`, `connection.ts`, `types.ts` (`ceb25b6`); decision matrix copied into Larity `docs/VAD.md`/this plan Notes |
| P5.8 | `SpeechStarted` — **DEFERRED** (Lucid deferred: unmeasurable without VAD-emitting client; do not wire unconsumed) | — |

### Deliverables
- [x] Tests merged (forward/session/vad/backpressure/keepalive/config); `bun test` total ≥ Lucid's 49-file equivalent for these areas
- [x] Two realtime instances locally (9001+9002): zero `unknown session` warns; subscribe/unsubscribe logged both sides
- [x] `mock:latency` unchanged/better; numbers recorded
- [x] Rebrand + Rebrand gate clean

### Notes
- P5.1, P5.2, P5.3, P5.4, P5.5, P5.6, P5.7, P5.2-close-fix (`f3acb1b`) applied in Lucid chronological order via filtered `git show` + `sed @lucid→@larity` (all clean; base files verified identical modulo rebrand imports before starting). P5.8 deferred (no code). Version bumps excluded.
- LIVE two-instance isolation 2026-09-22 (ports 9002+9003 — 9001 occupied by host rustfs; shared `lucid-redis` 56379): one 8 s harness run per instance (`test-session-alpha/beta`, 500 frames each) → both logged per-session `Subscribed to session channels` on connect + `Unsubscribed from session channels` on disconnect (proves `f3acb1b` `ws.raw` close-identity fix: unsubscribe fires); zero `unknown session` warns either side; wildcard kept only for `realtime.*` control.
- `mock:latency` post-P5 (single instance, 10 s, 624 frames): drops 0, recv→send p50 0 / p95 1 / p99 1 — unchanged/better.
- P5.7 matrix copied into Larity `docs/VAD.md` (`Deepgram tuning knobs` section, defaults locked); `connection-config.test.ts` locks defaults in code. `SpeechStarted` (P5.8) stays unwired per Lucid's own deferral condition.
- Gates: `ultracite` 447 files clean; `check-types` 11/11; `bun test` 191 pass / 3 fail across 50 files (same inherited family, no new failures; all ~30 new P5 tests green: forward 7, session 5+3, vad 3, backpressure 6, keepalive 4, config; final suite 194/0 after Phase 9 test-isolation fix).
- P5.7 matrix (Lucid 2026-09-20, real keys): baseline p50 346 ms; `no_delay` NO CHANGE; mic `diarize=false` −17% p50 but attribution caveat → **keep default diarize on**; `utterance_end_ms=800` rejected by API — never use.

---

## Phase 8 — Docs & env consolidation (functional hunks only)

**Why last:** doc drift correction after code is in, still under the deployment freeze.

### Items
| ID | Item |
|---|---|
| D8.1 | Larity `docs/TIERING.md`: metrics section → real counters (mirror Lucid `47b86d2`), Tier-2 provider GC + 3000 ms, Tier-4 `3.5-flash-lite`, "no DB on hot path", brute-force commitment index (not HGET-per-utterance) |
| D8.2 | Larity `docs/VAD.md`: clock-offset measured half-RTT (P1.11), P4 transport sections, P5.7 decision matrix |
| D8.3 | Larity `docs/SPECULATIVE_PROCESSING.md`: replace with Lucid's rewritten honest version (flag, throttle, cost gate, NO-GO state) |
| D8.4 | Larity `docs/FEATURES.md`: speculative described as flag-off; provider names |
| D8.5 | `.env.example`: final key set — `GENERALCOMPUTE_*`, `GEMINI_TIER4_MODEL`, Deepgram knobs (defaults commented), `SPECULATIVE_ENABLED=false` comment; remove/alias `SAMBANOVA_*`; **zero deploy/hosting values** (Rule 6) |
| D8.6 | Larity `.context/architecture-and-flow.md` + `.context/meeting-mode.md`: update hot-path description (publish-before-embed, per-session subscribe, Channel transport) — edit Larity docs, do not `cp` Lucid's (Lucid `.context` is empty) |
| D8.7 | Copy execution notes worth keeping from Lucid plan Notes (commit-hook lessons: ultracite before `git add`, version-bump restore, `git add` untracked files first) into this file's Notes sections |

### Deliverables
- [x] Docs match shipped behavior (spot-check each claim against code)
- [x] `bun x ultracite check` clean; no rebrand hits
- [x] Deployment artifacts untouched: `git diff --stat main -- docker-compose* docker/ .github/workflows/` empty except none

### Notes
- D8.1 TIERING: Tier-2 diagram line → General Compute `gpt-oss-120b`; P2.6 no-DB paragraph added; metrics file-tree → real counters (mirrors Lucid `47b86d2`); env table already had GC + 3000 + `3.5-flash-lite` + `TIER2_REASONING_EFFORT` from Phase 4. "Brute-force commitment index" has no Lucid doc source (string absent in Lucid docs too) — nothing to mirror.
- D8.2 VAD: done across phases (P1.11 half-RTT line, P4.7 row + P4.2–P4.5 hardening section, P5.7 knobs matrix) — verified present.
- D8.3 SPECULATIVE: Lucid honest rewrite ported in Phase 5 (byte-identical to Lucid now).
- D8.4 FEATURES: flag-off callout added to §3.2 + Tier-2 provider suffix; Lucid's file-link bullet lists skipped (from excluded desktop-fix commits, out of D8.4 scope).
- D8.5 `.env.example`: `SAMBANOVA_*` gone; `GENERALCOMPUTE_*` + `TIER2_REASONING_EFFORT` + `GEMINI_TIER4_MODEL` + Deepgram knobs (commented defaults) + `SPECULATIVE_ENABLED=false` comment; `MERGE_PUBLISH_GAP_MS` sample corrected 700→250; dead `MAX_BUFFER_SIZE` removed (P2.12 deleted it from code; Lucid left it stale — deliberate one-step-beyond). Zero infra/deploy values.
- D8.6 `.context`: architecture-and-flow §6 + meeting-mode hot-path verified consistent with shipped code (publish-before-embed sentence sharpened explicitly; subscribe/transport prose already accurate); `timeline.md` historical entries intentionally untouched (append-only log).
- D8.7 execution lessons (from Lucid plan Notes, applied throughout this port): (1) `git commit -- <paths>` fails on untracked files — `git add` new files first; (2) the pre-commit version-bump hook rewrites version files — if a commit aborts midway, restore worktree version files from the index before retrying; (3) always run `bun x ultracite check` from the repo root before `git add`/commit — `ultracite fix` in the hook can reformat and tangle the tree. Cleanest flow: ultracite check → `git add` → commit, with no other unstaged changes present. (No commits made in this port per operator instruction; work staged on `port/lucid-p0-p5`.)

---

## Phase 9 — Full verification & merge

| ID | Item |
|---|---|
| V9.1 | Full gate: `bun x ultracite check && bun test && bun x turbo run check-types && make rust-clippy` |
| V9.2 | `bun run mock:latency -- --duration=180` on Larity stack — final Baseline row fill; compare to Lucid Phase 0/1 numbers |
| V9.3 | Live smoke (keys): Deepgram finals → publish (pre-embed) → Tier 2 GC → Tier 3 → (Tier 4 `3.5-flash-lite` if budget) → alert on wire |
| V9.4 | Two-instance realtime isolation re-check (P5.2 regression) |
| V9.5 | Rebrand sweep repo-wide: `rg -n "@lucid|lucid:|lucid\.app|/Lucid" apps packages docs .env.example` → zero |
| V9.6 | Merge `port/lucid-p0-p5` → main; tag; record completion date in tracker |

### Verification record

- [x] V9.1 full gate: `bun x ultracite check` clean; `bun test` 204 pass / 0 fail across 50 files; `bun x turbo run check-types` 11/11; `cargo fmt --check` clean; `cargo clippy --all-targets -D warnings` clean; `cargo test` 22/22 green.
- [x] V9.2 180-second harness (post-review-fix): 11,250 frames, zero `ingest.frames_dropped_connecting_total`, `ingest.frame_recv_to_deepgram_send_ms` p50 0 / p95 0 / p99 1, `stt.deepgram_connect_ms` p50 1588 ms (two fresh connects), `receivedByType` empty (sine fixture; expected).
- [x] V9.3 live provider checks: General Compute `gpt-oss-120b` returned parsed `commitment` confidence 0.96; Gemini `gemini-3.5-flash-lite` returned parsed Tier 4 JSON (confidence 0.95). Full speech-to-alert wire smoke is **UNPROVEN (no speech PCM fixture in repo; synthetic sine produces no Deepgram finals)** — no fabricated result.
- [x] V9.4 two-instance isolation re-check: realtime 9002 + 9003, unique sessions, 312 frames each, subscribe/unsubscribe logged on both, zero `unknown session` warnings.
- [x] V9.5 rebrand sweep: exact repo-wide command returned zero hits; deployment diff and `git diff main --check` clean.
- [ ] V9.6 merge/tag intentionally not performed: operator instruction prohibits committing/merging unless explicitly requested; work remains staged on `port/lucid-p0-p5`.

### Notes
- Phase 9 added a small runtime-neutral testability seam to `UtteranceFinalizer` (`dependencies.embedder` / `dependencies.topicManager`) so the ported tests use injected fakes instead of Bun `mock.module` globals; production defaults remain unchanged. This resolved the inherited cross-file mock leakage.
- Senior-review blockers dispositioned (with tests):
  - **Tier-2 invalid body field**: removed `reconnectAttempts` from `buildTier2Request` (a Deepgram/SDK-client option, verified serialized into the OpenAI JSON body by a local wire probe); reconnection stays via `maxRetries: 0` on the client. `tier2-request.test.ts` now asserts the field is absent.
  - **P1 queue loss**: `flushPendingFrames` peeks and only dequeues after a successful `sendMedia`, so a transient send failure retains the frame for the next flush; test forces one throw and asserts ordered retry.
  - **P1 close handling**: every non-stale close now flushes accumulated intermediate finals (once; `speech_final` already reset the accumulator), and 1011 idle close abandons the generation so late events are ignored without reconnecting. Tests cover 1011 abandonment, accumulator flush, and exactly-once on `speech_final` + drop.
  - **P2.4 republish UI**: duplicate-id utterance now replaces/merges the existing row instead of being dropped.
  - **P5 stale close**: `isActiveConnection` gates `onClose` side effects, so a replaced socket closing cannot end/tear down the live session.
  - **P5 subscribe race**: per-session desired-state + serialized reconcile in the realtime subscriber; close during an in-flight subscribe now unsubscribes. Test added.
  - **Admin metrics auth**: `/admin/metrics` requires `ADMIN_API_KEY` when configured (dev/local remains open when unset); `apps/mock/scripts/latency.ts` sends the key when present. Tests cover both branches.
  - **P4 settings VAD**: `settings.tsx` passes a no-op `Channel` to `audio_capture_start`; Linux loopback spawn errors now propagate to `audio_capture_status` instead of being swallowed.
  - **Mixed-version STT**: meeting-mode subscribes the legacy `meeting.stt.*` pattern and routes only true legacy shapes, so old publishers' finals are not dropped and new shapes are not double-handled.
  - **P4 session binding (client)**: `connect()` replaces a socket bound to a different session and clears queued frames; `handleRawAudioFrame` rejects frames whose session no longer matches. Test added.
- Second review pass fixes: same-id republish now preserves client-derived enrichment (`isCommitment`/`hasAlert`/`hasMemory`, fallback `topicId`) instead of clobbering it; `onOpen` subscribes only after the capacity check so a rejected connection cannot leak a subscription; the subscriber reconcile rolls back a channel subscribe when `psubscribe` fails and always clears tracking on unsubscribe; admin-metrics test covers a wrong Bearer key.
- Remaining non-blocking debt (tracked in Post-port backlog): embedding-timeout cancellation (AbortSignal), merged-away topic reassignment, pipeline `closeSession` in-flight drain, integration test-client tag framing, and provider-default leftovers in non-hot-path summarizer/brief/worker calls.
- `bun test` still emits expected Redis `NOAUTH` and mocked S3 logs from hermetic tests; they do not fail tests and are environment noise from the pre-authenticated local Redis port.

---

## Post-port backlog (out of scope, tracked)

- **Phase 6 (Lucid):** zustand live-meeting store, `TranscriptStream` virtualization, overlay ≤10 Hz batching — not in Lucid; plan separately against Larity's already-optimized UI.
- **Measurement debt carried from Lucid:** Tier-4 p95 alert budget (needs live SambaNova→GC success + Gemini budget), real-speech `--pcm-file` latency E2E, 30-min xrun soak, macOS loopback on hardware, P3.6 dogfood hit-rate (then consider flag-on).
- **Review-fix follow-ups (non-blocking):** embedding-timeout `AbortSignal` cancellation; merged-away utterances skip a second `assignTopic`; make `MeetingPipelineEngine.closeSession` async and drain in-flight evaluations before finalizer teardown; update `apps/realtime/scripts/test-client.ts` to send `[tag][PCM]` frames; decide whether summarizer/brief/worker defaults move off `gemini-3.1-flash-lite`.
- **Optional later:** consolidation of duplicated metrics registry into `@larity/logger` (Lucid deferred until a third copy exists).
- **Do not schedule:** AWS/Caddy deployment port, OAuth removal, web re-host.

---

## Progress tracker

| Phase | Status | PR | Started | Done | Key numbers |
|---|---|---|---|---|---|
| 0 — Preparation | done | | 2026-09-22 | 2026-09-22 | bun test 22/0, check-types 11/11, ultracite 399 clean, mock:latency n/a |
| 1 — P0 Observability | done | | 2026-09-22 | 2026-09-22 | /admin/metrics live, harness 624f/36 drops, connect p50 1580, tests 37/11 |
| 2 — P1 Correctness | done | | 2026-09-22 | 2026-09-22 | drops 36→0, orphans 0, 78 tests/25 files, clippy clean |
| 3 — P2a Publish path | done | | 2026-09-22 | 2026-09-22 | publish-before-embed code in, mappers green, final 204/0 |
| 4 — P2b Pipeline + providers | done | | 2026-09-22 | 2026-09-22 | GC commitment/0.96 live, 3.5-flash-lite live, final 204/0, timeout 3000 |
| 5 — P3 Speculative (off) | done (early, pre-4b) | | 2026-09-22 | 2026-09-22 | flag off, NO-GO recorded, honest docs, final 204/0 |
| 6 — P4 Desktop transport | done | | 2026-09-22 | 2026-09-22 | zero audio-frame emits, clippy+22 Rust tests clean, final 204/0, harness p50 0/p95 1 |
| 7 — P5 Server/Redis | done | | 2026-09-22 | 2026-09-22 | 2-instance isolation live, final 204/0, defaults locked |
| 8 — Docs/env | done | | 2026-09-22 | 2026-09-22 | docs match code, rebrand clean, deploy files untouched |
| 9 — Full verification | verified (review blockers fixed); merge pending operator | | 2026-09-22 | 2026-10-01 | 204/0 tests, 180s harness p50 0/p95 0, provider live, isolation/rebrand clean, all review blockers dispositioned |
