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

The decisions below (B.1–B.11) were adopted after a full audit of the pipeline for latency, cost, and failure modes. All of them are already reflected in `meeting-mode.md`, `architecture-and-flow.md`, and `timeline.md` — this section exists to make the reasoning easy to audit without diffing the long docs.

### B.1 Parallel Tier 1 / Tier 2 / Tier 3 execution
- **Context:** Tiers 1, 2, 3 each take a different latency (50ms / 200ms / 100ms) and none consumes another's output. Running them sequentially costs ~350ms for no reason.
- **Decision:** Run them with `Promise.all`. A pure-in-process gate decides Tier 4 after they resolve. Latency envelope drops from ~350ms to ~200ms without Tier 4, and <720ms with Tier 4 — fitting the <800ms end-to-end budget.
- **Subtlety:** Tier 2's ledger write is awaited inside the Tier 2 task, so Tier 3's ledger search sees prior commitments but not the current one. Tier 1 blocklist/technical hits still fire "instant" alerts without waiting on Tier 4.
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

### B.9 Raw audio persistence to MinIO
- **Context:** Whisper refinement and post-meeting diarization both want raw audio. The previous design implicitly assumed it was available but never specified where.
- **Decision:** `apps/realtime` streams each PCM chunk in parallel to both Deepgram (live) and MinIO (cold), fire-and-forget on the MinIO side. Object layout `{orgId}/{sessionId}/{chunkIndex}.pcm16` (or Opus), manifest emitted on close, 30-day lifecycle with per-org SSE keys. Admin-only restore endpoint stitches chunks into a WAV for debugging.
- **Where:** timeline Day 47-48.

### B.10 Desktop distribution & auto-update
- **Context:** A Tauri app is not a product until end users can install and update it safely. This was previously buried inside "frontend polish" and chronically under-scoped.
- **Decision:** A dedicated phase ("Day 46+"): Windows code-signed MSI, macOS Developer ID + notarization + hardened runtime with microphone/screen-recording entitlements, Linux .deb/.rpm/.AppImage, Tauri signed auto-update manifest on S3/MinIO/R2 with staged rollout (10 → 50 → 100% over 48h), Sentry crash reporting with scrubbed breadcrumbs. Updates only apply on next launch — never mid-meeting.
- **Where:** timeline Day 46+.

### B.11 Structured pipeline observability
- **Context:** Without metrics, the <800ms budget is aspirational. Smoke scripts aren't enough.
- **Decision:** Per-utterance JSON line with all per-tier latencies, costs, cache hits, gate decisions, and total end-to-end latency. Per-session rollup (p50/p95/p99 latency, total cost, tier counts) on meeting end. Optional Prometheus histograms if infra is in place. Metrics key off `sessionId` / `utteranceId` so anything can be drilled down.
- **Where:** timeline Day 28 (pipeline side) + Day 44-46 (E2E validation).

### B.12 Dual-channel host audio intake
- **Context:** Mixing the host mic with system loopback before STT risks clipping, comb filtering, and ambiguous diarization. It also makes the host's own speech depend on VAD correlation, even though the host mic is directly available on the host machine.
- **Decision:** Host streams a 2-channel interleaved linear16 feed: ch0 = host mic, ch1 = OS-level system loopback. Deepgram runs with `diarize=true`, `multichannel=true`, `channels=2`. Channel 0 is assigned to the host `SpeakerIdentity` directly; channel 1 continues to use VAD-correlation for non-host TEAM speakers and EXTERNAL fallback.
- **Tradeoff:** Deepgram cost doubles from one channel-minute to two channel-minutes during live meetings. The all-in nominal 1-hour cost moves from ~$0.76 single-channel to ~$1.22 dual-channel, but host WER and host identity reliability improve materially.
- **Where:** [meeting-mode.md §5.1](./meeting-mode.md#51-audio--stt--utterance-pipeline), timeline Post-Day 23 Patch.
