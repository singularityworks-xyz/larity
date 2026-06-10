# Larity Architecture Decisions & Suggestions

This document tracks architectural decisions, technical tradeoffs, and implementation suggestions as we progress through the Day 9 to Day 30 timeline.

### Day 9: Server-Side Diarization Correlation
**Decision:** `SpeakerIdentifier` State Persistence
- **Context:** Identifying speaker identity correlations correctly requires caching previous identifications for the exact `diarizationIndex` Deepgram provides across a session.
- **Tradeoff:** Storing this entirely in-memory on the NodeJS server means if the realtime node restarts or crashes, we lose the mapping.
- **Decision:** As specified in the timeline, we will persist this identity mapping (`diarizationIndex -> SpeakerIdentity`) into a Redis Hash at `meeting.speaker.{sessionId}`. When a session boots or a late-joining user connects, they can hydrate their speaker layout seamlessly from this central ledger.

**Decision:** Buffer Management for Ambiguous Utterances
- **Context:** An utterance comes in at `t=5000`, but network latency delays the VAD signal from the desktop client until `t=5500`.
- **Decision:** 
  1. We immediately emit the utterance flagged as `EXTERNAL` to ensure < 50ms latency to the user.
  2. We push it into a `pendingBuffer` up to a maximum duration (`~2s`).
  3. If VAD belatedly confirms it was a TEAM member, we emit an updated copy of the utterance with the corrected mapping. The client must be built to support overriding recent utterances by `utterance.id`.

### Day 15-16: Topic State Management
**Decision:** Gemini (`@google/genai`) for Embeddings and Summarization
- **Context:** `TopicManager` groups utterances into topics via embedding similarity and generates summaries.
- **Tradeoff:** Originally planned `OpenAI text-embedding-3-small`.
- **Decision:** Shifted to Gemini via `@google/genai` for both embeddings and LLM summaries. It provides excellent multi-modal consistency and cost-efficiency.
- **Implementation Note:** Test failures arose due to `GoogleGenAIEmbedder` and `TopicSummarizer` attempting real network calls and yielding `403 PERMISSION_DENIED`. The fix involved strict mocking of these network-dependent services in `pipeline.integration.test.ts` and `finalizer.test.ts`.

**Decision:** Topic State Publishing
- **Context:** We need clients to stay updated with rolling topic summaries and assignments without spamming them on every utterance.
- **Decision:** `TopicManager` publishes topic updates to Redis (`meeting.topic.*`) and stores state in a Redis hash. LLM summarization calls are debounced or only run on session close to manage costs.
- **Testing Adjustment:** The `UtterancePublisher` mock was updated to only assert on expected channels (`meeting.utterance.*`), preventing the new topic publish events from breaking `expect(publisher.calls).toHaveLength(1)`.

**Decision (follow-up): Remove semantic redundancy between Topic Summarization and Tier 2**
- **Context:** If both TopicManager and Tier 2 independently perform per-utterance semantic extraction, we pay duplicate latency/cost for equivalent inference.
- **Decision:** Tier 2 is the single per-utterance semantic source of truth. It emits structured `topicDelta` fields used by a deterministic topic-state reducer. Topic summary LLM calls are retained only as asynchronous refinement (topic shift/close/significant delta), never as a hot-path dependency.
- **Consequence:** Alerting latency and gating remain unchanged; topic summaries stay current even if refinement calls fail.

**Decision (follow-up): Shared embedding per utterance across pipeline consumers**
- **Context:** Topic assignment and Tier 3 both require utterance embeddings; computing them separately is wasteful.
- **Decision:** Generate one utterance embedding and reuse it across Tier 3 checks, topic centroid assignment, Tier 2 semantic-cache similarity, and commitment-ledger writes.
- **Consequence:** Fewer API calls and lower p95 without reducing detection quality.

---

## Architectural Overhaul — Latency & Cost Hardening (pre-Week 4 review)

The decisions below (B.1–B.19) were adopted after audits of the pipeline for latency, cost, and failure modes. All of them are reflected in `meeting-mode.md`, `architecture-and-flow.md`, and `timeline.md` — this section exists to make the reasoning easy to audit without diffing the long docs.

### B.1 Parallel Tier 1 / Tier 2 / Tier 3 (+ constraint extraction)
- **Context:** Tiers 1, 2, 3 each take a different latency (50ms / 200ms / 100ms) and none consumes another's output. Constraint extraction is regex-on-text and is independent. Running tiers sequentially costs ~350ms for no reason.
- **Decision:** Run tiers **and** `constraintManager.processUtterance` with `Promise.all`. A pure-in-process gate decides Tier 4 after they resolve. Tier 3’s three pgvector lookups (`decisions`, `policy_guardrails`, `important_points`) run in parallel (`Promise.all`) inside `Tier3SearchEngine.searchMemory`.
- **Subtlety:** Tier 2's ledger write is awaited inside the Tier 2 task, so Tier 3's ledger search sees prior commitments but not the current one. Tier 1 blocklist/technical hits still fire "instant" alerts without waiting on Tier 4.
- **Subtlety:** Tier 4 **`forceTier4`** (from Tier 3 memory/ledger hits) does **not** run Gemini when **`shouldStopForDeepReasoning`** is true (Tier 2 high-confidence `filler`/`general`, no risks), unless **`highSignal`** is already true. Traces/logs may therefore show **`fT4=yes`** with **`runT4=no`**.
- **Where:** [meeting-mode.md §5.6.1](./meeting-mode.md#561-pipeline-orchestration--parallel-tier-execution), timeline Day 28.

### B.2 Direct Rust/uWS → Deepgram audio path (no Redis, no JS PCM relay)
- **Context:** Audio is exactly one-producer (host Rust audio engine) → one-consumer (Deepgram WS). Routing PCM frames through Redis adds ~2–5ms per 20–100ms frame and no fan-out value. Routing PCM through Tauri events and JS adds base64 inflation, IPC overhead, and renderer-thread contention.
- **Decision:** The host desktop opens the realtime WebSocket from Rust and sends binary PCM frames directly. The realtime worker holds both the host WS and the Deepgram WS in the same process and relays audio frame-for-frame. Redis stays reserved for state, control, and pub/sub — never audio. React controls start/stop/status but does not carry PCM in production.
- **Where:** [architecture-and-flow.md §6](./architecture-and-flow.md#6-audio-capture--transport), timeline Day 14.

### B.3 Commitment ledger = in-memory HNSW + Redis snapshot
- **Context:** Plain Redis has no vector search. RediSearch adds a 1–2ms RTT per query and per-write serialization. The ledger is small (few hundred commitments/session) and session-scoped, so it can live in-process.
- **Decision:** Primary = per-session in-memory HNSW (sub-ms top-K). Secondary = Redis JSON snapshot for durability, observer fan-out (`meeting.ledger.{sessionId}` pub/sub), and crash recovery. Tertiary = pgvector at meeting end for org memory.
- **Where:** [meeting-mode.md §5.4.2](./meeting-mode.md#542-commitment-ledger-in-memory-hnsw--redis-snapshot-entire-meeting), timeline Day 17-18.

### B.4 Channel-aware diarization index reassignment-merge
- **Context:** Deepgram reassigns speaker indices after long silences — the same talker may appear as `speaker=0` then later as `speaker=3`. Treating these as two speakers destroys contradiction detection.
- **Decision:** `SpeakerIdentity` owns a **set** of `{ channel, index }` pairs. On a new unseen channel/index pair, channel 0 short-circuits to the host identity; channel 1 uses VAD correlation. If VAD points to the same userId and the gap since the candidate identity last spoke > 15s, merge (don't create a new speaker). Cache changes from `Map<index, SpeakerIdentity>` to `Map<channel:index, speakerId>` + `Map<speakerId, SpeakerIdentity>`.
- **Where:** [meeting-mode.md §3.3.2](./meeting-mode.md#332-diarization-index-reassignment--merge-logic), timeline Day 10-11.

### B.5 Per-client rolling-median clock-offset reconciliation
- **Context:** Client-side timestamps drift, jitter, and break on laptop sleep. A fixed ±300ms tolerance is a band-aid.
- **Decision:** Server computes `sampleOffset = serverReceiveTs - clientSendTs - halfRTT` per message and keeps a rolling median of the last 30 samples per client. VAD timestamps are offset-corrected before correlation; the window tightens to ±250ms. Large offset shifts (>500ms) trigger a short untrusted window (~2s) instead of bad assignments.
- **Where:** [meeting-mode.md §3.3.1](./meeting-mode.md#331-clock-offset-reconciliation), timeline Day 10-11.

### B.6 Per-session Tier 2 semantic cache
- **Context:** Meetings have enormous boilerplate: "yeah that works", "got it", "makes sense", repeated verbatim or near-verbatim. Each hit is ~$0.002 and ~200ms of Tier 2 LLM time.
- **Decision:** Per-session LRU cache keyed by utterance embedding (cosine ≥ 0.97) or normalized text, max ~200 entries. Cache hit reuses Tier 2 classification and skips the LLM call; Tier 3 still runs because memory may have changed.
- **Target:** ≥30% hit rate on filler/confirmations, shaving ~$0.05 and ~100ms per hit.
- **Where:** timeline Day 28.

### B.7 Per-meeting cost ceiling
- **Context:** The nominal LLM/embedding intelligence layer is ~$0.30 per meeting, while the dual-channel all-in path is ~$1.22 for a 1-hour meeting once Deepgram channel-minutes are included. A pathological meeting (lots of contradictions, long recent-utterance windows) could still blow the LLM-side budget by 10× if Tier 4 is ungated.
- **Decision:** Redis counter `meeting:cost:{sessionId}` updated with real token usage after every Tier 2 and Tier 4 call, plus Deepgram channel-minute estimates from the audio intake. Default cap $2.00/meeting. At 80% of cap raise Tier 4 gate thresholds; at 100% disable Tier 4 entirely for the rest of the meeting (Tiers 1-3 and Tier 1 instant alerts keep running).
- **Where:** timeline Day 28.

### B.8 Atomic alerts, no progressive flicker
- **Context:** Showing a preliminary alert at T+300ms that mutates or disappears at T+500ms creates a cognitive trap during live conversation. Users act on the first version and then it changes under them.
- **Decision:** One atomic alert per Tier 4 invocation, or none. A content-free "Checking…" indicator signals that the system is thinking — nothing actionable renders until the full structured Tier 4 response is validated. Streaming is still used *inside* the LLM call to reduce TTFB; only the UI is non-progressive.
- **Where:** [meeting-mode.md §5.9](./meeting-mode.md#59-live-llm-invocation-non-streaming-atomic-alerts), timeline Day 41-42.

### B.9 Raw audio persistence to Cloudflare R2
- **Context:** Whisper refinement and post-meeting diarization both want raw audio. The previous design implicitly assumed it was available but never specified where.
- **Decision:** `apps/realtime` streams PCM frames **in parallel** to both Deepgram (live path) and Cloudflare R2 (cold path) using fire-and-forget semantics — failures never block live processing. Object layout is a **single file per session** (`{orgId}/{sessionId}/raw_audio.pcm16`) assembled via `@aws-sdk/lib-storage` `Upload` (multipart upload over a Node.js `PassThrough` stream). On session close, a `manifest.json` is written alongside the audio. Admin-only restore endpoint (`GET /admin/sessions/:id/audio.wav`) streams the raw PCM back with a prepended 44-byte WAV header.
- **Provider:** Cloudflare R2 (zero egress fees). The SDK (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`) is provider-agnostic. SSE uses `ServerSideEncryption: "AES256"` on all writes. R2 region is always `"auto"`.
- **Where:** `apps/realtime/src/audio/streamer.ts`, `apps/realtime/src/routes/admin.ts`, timeline Day 47-48 (implemented).

### B.10 Desktop distribution & auto-update
- **Context:** A Tauri app is not a product until end users can install and update it safely. This was previously buried inside "frontend polish" and chronically under-scoped.
- **Decision:** A dedicated phase ("Day 46+"): Windows code-signed MSI, macOS Developer ID + notarization + hardened runtime with microphone/screen-recording entitlements, Linux .deb/.rpm/.AppImage, Tauri signed auto-update manifest on Cloudflare R2 with staged rollout (10 → 50 → 100% over 48h), Sentry crash reporting with scrubbed breadcrumbs. Updates only apply on next launch — never mid-meeting.
- **Where:** timeline Day 46+.

### B.11 Structured pipeline observability
- **Context:** Without metrics, the <800ms budget is aspirational. Smoke scripts aren't enough.
- **Decision:** Per-utterance structured trace covering tier outcomes, **`runTier4`** / **`forceTier4`** / **`highSignal`**, latency slices (`tier2`, gate, Tier 4 wall, total), optional Tier 4 **surfacing** copy (**`message`**, **`surfaceReason`**, **`suggestion`**) — **no** embeddings, **no** internal Tier 4 **`reasoning`**. Implemented as Redis pub/sub on **`meeting.pipeline.{sessionId}`** (`pipelineTraceChannel`, version field in payload). Logs can pretty-print JSON when **`PIPELINE_TRACE_PRETTY_JSON`** is on (non-production default). **Prometheus:** tier duration histograms, context-cache counters, ledger flush counter, finalizer embed/publish-wait (`packages/meeting-mode/src/pipeline/metrics.ts`); richer rollups remain optional roadmap.
- **Where:** `packages/meeting-mode/src/pipeline/pipeline-trace.ts`, timeline Day 28 (partial), realtime subscriber for **`meeting.pipeline.*`**.

### B.12 Dual-channel host audio — two mono Deepgram streams (implemented)

- **Context:** Shipping mic + system audio as one **interleaved 2-channel** blob to a single Deepgram `multichannel=true` connection coupled the two streams (head-of-line / jitter pairing), caused asymmetric latency (mic vs loopback), and made stream-clock alignment fragile. A single connection also obscured per-source tuning and logging.
- **Decision:** The host still captures **two logical sources** (mic = capture channel 0, OS loopback = capture channel 1), but the wire format is **tagged mono PCM**: each WebSocket binary frame is `[tag: u8][linear16 mono little-endian …]` with `tag=0` (mic) or `tag=1` (system). The realtime worker owns **`createDualChannelSession`**: **two** Deepgram live connections per meeting session, each `channels=1`, **`diarize=true`**, `sample_rate=16000`. Published `SttResult.channel` is the logical capture channel (0 or 1), not Deepgram's internal `channel_index` from a multichannel decode.
- **Desktop (Tauri):** Prefer **Rust-native** WebSocket upload of tagged frames; avoid hot-path Tauri audio events for production host streaming. **Interleaved `mixer.rs`** (paired buffers + mixed output) is **legacy / incompatible** with the dual-session server unless the client emits **per-source tagged mono** instead. Target pattern: **`DualChannelRelay`**-style unbounded forward of mic/sys chunks with resampling (e.g. fixed-rate mic path) and **VAD** edges emitted off the realtime callback (async `app.emit`). Linux **`parec`** should not block the mic path on a bounded mixer queue.
- **Tradeoff:** Two live WebSocket connections to Deepgram per host session (billing aligns with two mono streams; confirm against current Deepgram pricing). Slightly more connection bookkeeping; **much** simpler latency and identity story.
- **Where:** `packages/stt/src/dual-channel-session.ts`, `packages/stt/src/deepgram/*`, `apps/realtime/src/handlers/on-message.ts`, desktop `src-tauri/src/audio/*` (evolving), [meeting-mode.md §2.1](./meeting-mode.md#21-the-host-model).

**Supersedes:** earlier B.12 text that specified a single Deepgram connection with `multichannel=true`, `channels=2`, and interleaved PCM on the wire.

### B.13 Tier 4 gate — Tier 2 “stop deep reasoning” vetoes naive `forceTier4`

- **Context:** Tier 3 can set **`forceTier4`** from loose embedding similarity against hydrated ledger rows (e.g. greetings near older commitments). Invoking Gemini on every such line wastes cost and violates the staged design.
- **Decision:** **`runTier4 = !shouldStopForDeepReasoning ∧ (highSignal ∨ forceTier4)`** with **`shouldStopForDeepReasoning`** matching Tier 2’s filler/general shortcut (no risk signals, confidence > 0.8). Embedding hits raise **`forceTier4`** but cannot alone trigger Tier 4 on those lines unless **`highSignal`** is already true (e.g. blocklist).
- **Where:** [meeting-mode.md §5.6.1](./meeting-mode.md#561-pipeline-orchestration--parallel-tier-execution).

### B.14 Split merger grouping vs publish timing (`MERGE_GROUPING_MS`, `MERGE_PUBLISH_GAP_MS`)

- **Context:** Same-speaker merge needs a **long** window to coalesce continuations, but using that same window to **gate Redis publish** created a multi-second transcript/alert floor (~5s tail).
- **Decision:** **`MERGE_GROUPING_MS`** (legacy **`MERGE_GAP_MS`**) drives **`UtteranceMerger.shouldMerge`** only. **`MERGE_PUBLISH_GAP_MS`** (~700ms default) drives **`scheduleMergerGapFlush`** (`pending audio end + gap`). `closeSession` still cancels/reschedules cleanly and awaits handler drains — see B.15.
- **Where:** [meeting-mode.md §5.5.1](./meeting-mode.md#551-utterance-merger-and-publish-timing), `packages/meeting-mode/src/env.ts`.

### B.15 Non-blocking publish handlers + per-session pipeline queue

- **Context:** Awaiting `evaluateUtterance` inside `onUtterancePublished` serialized finals behind Tier 2/Tier 4 latency.
- **Decision:** Handlers run **fire-and-forget** from `UtteranceFinalizer.publishUtterance` (errors logged). **`MeetingPipelineEngine.evaluateUtteranceQueued`** maintains a **per-`sessionId` promise chain** for FIFO evaluation + trace callbacks. **`closeSession`** awaits in-flight published-handler promises for that session before teardown.
- **Where:** `utterance/finalizer.ts`, `pipeline/engine.ts`.

### B.16 Session hot-path caches (context payload, cost cap)

- **Context:** Per-utterance Redis GET for meeting context and session cost added redundant RTTs after hydrate.
- **Decision:** Cache **`PreloadedContextPayload`** on **`SessionPipelineState`** after first hydrate; **`CostManager.getSessionCost`** uses a TTL **hot cache** (**`COST_CAP_CACHE_TTL_MS`**) with **`primeSessionCost`** on pipeline hydrate.
- **Where:** `pipeline/engine.ts`, `cost/manager.ts`.

### B.17 Debounced ledger Redis snapshots

- **Context:** Full JSON snapshot **`SET`** on every commitment/constraint mutation dominated Redis time.
- **Decision:** **`LEDGER_SNAPSHOT_DEBOUNCE_MS`** coalesces snapshot writes; flush on session close; **`ledger_snapshot_flushes_total`** counter. When debounce is 0 (tests), callers await immediate flush.
- **Where:** `commitment/ledger.ts`, `constraint/ledger.ts`.

### B.18 Tier 2 schema enforcement (Groq JSON schema strict mode)

- **Context:** Tier 2 runs as **`chat.completions`** on **Groq** with **`response_format: json_schema`** (`strict: true`). Providers require every key under `properties` to appear in `required`; optional fields are modeled as **`null`**.
- **Decision:** **`extractedData`** and non-null **`topicDelta`** objects list **all** keys in schema `required` with nullable types; Zod preprocess strips **`null`** post-parse. Mis-specified schemas yield HTTP 400 before inference ("Tier2 classification failed silently" in logs).
- **Where:** `pipeline/tier2.ts`, `pipeline/types.ts`, `GROQ_TIER2_MODEL` / `GROQ_API_KEY` in `env.ts`.

### B.19 Utterance timestamp = speech time, not processing time (`speechTimestamp`)

- **Context:** VAD correlation compares utterance timestamps against VAD intervals (clock-adjusted speech-event times). The original `SttResult.ts` was `Date.now()` — the wall clock when Deepgram's transcript handler ran, which is typically 3–8 seconds after the actual speech. For short utterances, the VAD interval would already be closed before the utterance timestamp existed, causing the ±250ms correlation window to always miss.
- **Decision:** Compute `SttResult.speechTimestamp = DeepgramConnection.connectionStartTime + (result.start * 1000)`, where `result.start` is Deepgram's seconds offset from stream start. The `connectionStartTime` is recorded when the Deepgram WebSocket `open` event fires. This timestamp represents the actual moment the speech occurred (in server time). VAD intervals also represent speech-event time (client send time adjusted by median clock offset), so they naturally overlap.
- **Where:** `packages/stt/src/deepgram/connection.ts`, `packages/stt/src/types.ts`, `packages/meeting-mode/src/utterance/finalizer.ts`, [docs/VAD.md §Migrations §speechTimestamp](./docs/VAD.md).
