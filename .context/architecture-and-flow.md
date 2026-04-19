# LARITY — FULL USER FLOW & ARCHITECTURE

*Chronological order of system behavior.*

**Reference Documents:**
- [meeting-mode.md](./meeting-mode.md) — Complete meeting mode specification (multi-user sessions, voice identification, tiered pipeline, alert system)
- [timeline.md](./timeline.md) — Development timeline with implementation details

---

## 0. High-Level Mental Model

Larity operates in three hard-separated modes. **No data, logic, or permissions leak across these modes.**

1.  **Live Meeting Mode** → Fast, read-only, ephemeral, multi-user. *(See [meeting-mode.md](./meeting-mode.md) for complete spec)*
2.  **Post-Meeting Mode** → Slow, authoritative, write-heavy.
3.  **Assistant / Chatbox Mode** → Query + explicit actions.

### System Architecture Overview

Larity is a **primary-native desktop application** (Tauri + React) that connects to a **shared remote server** for all meeting processing. A separate web app (`apps/web`) exists for dashboards, logs, and admin — but it is not used during live meetings and never captures audio. There is **no browser extension** and there will never be one.

Key architectural decisions:
- All real-time processing runs on the remote server — never locally on any user's machine.
- The host's desktop app captures **OS-level system audio (loopback)** from its machine, so the product is completely independent of which conferencing tool the team is using — Zoom, Google Meet, Microsoft Teams, Discord, Slack Huddle, Jitsi, a SIP phone bridged through the OS, or a future platform that doesn't exist yet.
- Speaker identification is VAD-correlation based — zero voice models, zero enrollment.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Larity Desktop  │     │  Larity Desktop  │     │  Larity Desktop  │
│  (Host — Rahul)  │     │  (Team — Priya)  │     │  (Team — Raj)    │
│                  │     │                  │     │                  │
│  Tauri + React   │     │  Tauri + React   │     │  Tauri + React   │
│  Captures OS-    │     │  View-only       │     │  View-only       │
│  level system    │     │  (no audio send, │     │  (no audio send, │
│  audio (loopback)│     │   sends mic VAD) │     │   sends mic VAD) │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │ WebSocket              │ WebSocket              │ WebSocket
         │ (audio + control)      │ (control only)         │ (control only)
         └────────────┬───────────┴───────────┬────────────┘
                      │                       │
              ┌───────▼───────────────────────▼───────┐
              │         SHARED REMOTE SERVER           │
              │                                        │
              │  ┌─────────────┐  ┌────────────────┐  │
              │  │   uWS.js    │  │    Elysia      │  │
              │  │  (realtime) │  │   (control)    │  │
              │  └──────┬──────┘  └───────┬────────┘  │
              │         │                 │            │
              │  ┌──────▼──────┐  ┌───────▼────────┐  │
              │  │  Deepgram   │  │  PostgreSQL    │  │
              │  │  STT +      │  │  + pgvector    │  │
              │  │  Diarize    │  │                │  │
              │  └──────┬──────┘  └────────────────┘  │
              │         │                              │
              │  ┌──────▼──────────────────────────┐  │
              │  │  Processing Pipeline             │  │
              │  │  Pre-filter → Tier1 → Tier2 →   │  │
              │  │  Tier3 → Tier4                  │  │
              │  └─────────────────────────────────┘  │
              │         │                              │
               │  ┌──────▼──────┐  ┌────────────────┐  │
               │  │  Redis       │  │  VAD signals  │  │
               │  │  (sessions,  │  │  (per client, │  │
               │  │   ledgers,   │  │   WebSocket)  │  │
               │  │   pub/sub)   │  └────────────────┘  │
               │  └─────────────┘                      │
               └────────────────────────────────────────┘
```

**Why remote server, not local Tauri-spawned:**
- Multi-user sessions require shared state accessible to all team members
- Alert routing (shared + personal channels) needs centralized pub/sub
- Consistent processing regardless of host machine specs
- Single Deepgram connection managed server-side
- Speaker identification (VAD correlation) runs server-side where diarization data lives

---

## PART I — APP BOOT & IDLE STATE

### 1. App Launch
**What Happens:** User opens Larity.
* **Tauri:**
    * Creates native window
    * Requests OS permissions (audio, mic)
    * **Connects to remote server** (uWS for realtime, Elysia for control)
    * Does NOT spawn local server processes — all processing is remote

**Why:**
* Zero cold-start during meetings
* Consistent experience regardless of local machine
* Shared server handles all heavy processing

### 2. Frontend Initialization
**React App:**
* Connects to **Elysia** (remote) via HTTP (REST)
* Connects to **uWS** (remote) via persistent WebSocket
* **Loads:** User profile, Org context, Assigned clients, Permissions, Upcoming meetings

**Data Sources:**
* PostgreSQL (via Elysia) — client-scoped queries
* Cached state (Redis)

---

## PART II — PRE-MEETING FLOW (AUTONOMOUS PREP)

### 3. Calendar-Driven Trigger
* **Trigger:** Meeting scheduled within threshold (e.g., T-15 min).
* **Elysia Actions:**
    * **Fetch:** Calendar details (Google/Outlook), Participants, Agenda
    * **Resolve Client:** Map meeting to Client (tenant)
    * **Pull Historical Context (client-scoped):** Previous meetings, Open decisions, Open questions, Important points, Tasks, Deadlines, PolicyGuardrails

### 4. Pre-Meeting Intelligence
* **Processing:**
    * Relevant data embedded (`pgvector`)
    * Graph traversal for relationships
    * Context assembled deterministically
* **LLM Usage (`@google/genai`):**
    * **Narrow prompts:** Pre-meeting brief, Role-specific talking points, Known risks, Open questions
* **Output:** Read-only artifacts shown in UI. **Not written as "memory" yet.**

---

## PART III — LIVE MEETING MODE (CORE DIFFERENTIATOR)

> **Complete Specification:** See [meeting-mode.md](./meeting-mode.md) for full details on multi-user sessions, voice identification, tiered pipeline, and alert system.

### 5. Meeting Session — Multi-User Join Flow

This is NOT a single-user experience. Multiple team members share a session.

#### 5.1 Host Starts Session
* **User Action:** Host has a meeting running in some conferencing tool (Zoom / Meet / Teams / Discord / SIP phone / anything). Larity's desktop app surfaces a tray/overlay prompt (from calendar trigger or audio-activity heuristic) — host clicks "Start Meeting Mode", or clicks it manually at any time.
* **What Happens:**
    1. `POST /meeting-session/start` → creates `meetingSession` record on remote server
    2. **Context Preload** (critical): Open decisions, known constraints, active policy guardrails, unresolved risks, org-level rules, **team roster for this session** (userId → name, for VAD correlation), **org keyword blocklists**, **prior commitments** from previous meetings with this client, **calendar agenda items**
    3. **Predictive Constraint Pre-embedding**: Parse agenda, identify likely topics, pre-embed constraint matches
    4. **Buffers Initialized**: Ring buffer (~2 min), topic state map, constraint ledger, **commitment ledger (Redis, entire meeting)**, speaker state trackers, VAD state per participant, alert state manager
    5. Audio pipeline armed — host's desktop app starts **OS-level system audio loopback** (WASAPI on Windows, ScreenCaptureKit on macOS 13+, PipeWire/PulseAudio monitor on Linux) and streams PCM frames over WebSocket to the remote server
    6. Deepgram connection opened with `diarize=true`
    7. Server-side `SpeakerIdentifier` armed with team roster; ready to correlate incoming VAD signals
    8. Ambient UI activated

#### 5.2 Team Members Join Session
* **User Action:** Team member opens their Larity instance, sees active session, clicks "Join Meeting Session"
* **What Happens:**
    1. `POST /meeting-session/join` → joins existing session by meetingId
    2. Receives sessionId + current session state (topics, constraints, commitments so far)
    3. Subscribes to shared and personal alert streams (Redis pub/sub)
    4. Subscribes to utterance stream (sees live transcription)
    5. Does NOT send system audio — host is the single audio source
    6. May optionally send mic audio once for voice identification

#### 5.3 System State After Join
* Live mode flag enabled for all participants
* **Memory writes disabled** during meeting
* LLM scope restricted to classification + reasoning (no creative generation)
* All participants see same ambient UI (topics, constraints, heartbeat)
* Alert routing active — shared channel + personal channel per user

### 6. Audio Capture & Transport
* **Host Side:** OS-level system audio loopback captured by the Tauri desktop app's Rust layer (WASAPI / ScreenCaptureKit / PipeWire or PulseAudio monitor source depending on OS) → downsampled to 16 kHz mono 16-bit PCM → chunked (20–100 ms) → binary frames sent to remote uWS server via WebSocket. The host's conferencing app is opaque to the rest of the system.
* **uWS Responsibilities:** Pipe audio **directly** to Deepgram. Maintain live session. **No logic, no AI, no Redis on the audio path.**
* **Audio path is direct — not through Redis.** Earlier iterations considered pushing audio frames through a Redis stream. That design is rejected: Redis adds a serialization + network hop for every 20–100 ms frame, which burns ~2–5 ms per chunk and adds no value (audio is not fanned out — exactly one consumer, Deepgram, per session). The realtime worker holds the Deepgram WebSocket and the client WebSocket in the same process; audio is simply relayed frame-for-frame. Redis is only used for state, control plane, and pub/sub — never for audio bytes.
* **Team members:** Do NOT send system audio. They only send local-mic VAD signals over the WebSocket control channel and receive processed results.

### 7. Streaming STT with Diarization
* **Deepgram Output:** Partial hypotheses with speaker indices → Corrections → Final segments with speaker attribution
* **Diarization:** Deepgram assigns speaker indices (0, 1, 2, ...) — these are arbitrary integers, not identities
* *Note: Raw STT output is not LLM-safe.*

### 7.1 Speaker Identification (VAD Correlation)

> **Full Details:** See [meeting-mode.md §3](./meeting-mode.md#3-speaker-identification-via-vad-correlation)

* Each team member's Larity instance runs **local VAD on their microphone** and sends timestamped speaking signals via WebSocket
* The server maintains a **rolling-median clock offset per client** (last 30 samples) so VAD timestamps align with the server's audio ingestion clock
* The server **correlates offset-corrected VAD timestamps against Deepgram diarization indices** (±250ms window after offset correction)
* Deepgram reassigns diarization indices after silences; the server merges a new index onto an existing `SpeakerIdentity` when VAD correlation points at the same userId and the gap since that identity last spoke exceeds the merge threshold (default 15s). `SpeakerIdentity` therefore owns a **set** of diarization indices.
* Matched → TEAM (with userId) | Unmatched → EXTERNAL (client)
* External speaker names from calendar data (best-effort)
* No voiceprint enrollment, no voice embeddings, no ML models required
* First utterances default to EXTERNAL until correlation is established; retroactively reprocessed once confirmed
* Works on Zoom, Meet, Teams, or any platform — OS-level audio capture makes it platform-agnostic

**Speaker Identity Model:**
```ts
interface SpeakerIdentity {
  speakerId: string               // Unique within session
  type: "TEAM" | "EXTERNAL"
  userId?: string                 // If TEAM, linked to User
  name: string
  diarizationIndices: number[]    // All Deepgram indices merged into this identity
  isCurrentUser: boolean          // Is this the viewer of this Larity instance?
  confidence: number              // Identification confidence (0-1)
  lastUtteranceTs: number
}
```

### 7.2 Speculative Processing (Latency Optimization)
* **On Partial Hypotheses (confidence > 0.7):**
    * Start intent classification speculatively
    * Identify likely topic from partial text
    * Pre-fetch relevant constraints for that topic
    * Pre-warm LLM connection if high-signal keywords detected
* **On Final:** If text matches speculation → use pre-computed results (200-300ms saved)
* **Success Rate:** ~85% of speculative work is usable

### 8. STT Normalization Layer
* **Component:** Utterance Finalizer (pure logic)
* **Actions:** Drop non-final segments, merge short utterances, add light punctuation, attach **speaker identity** + timestamp
* **Output:**
    ```json
    {
      "speaker": {
        "speakerId": "spk_2",
        "type": "TEAM",
        "userId": "user_rahul",
        "name": "Rahul",
        "isCurrentUser": false,
        "confidence": 0.92
      },
      "text": "I think we can ship by Friday.",
      "ts": 1730000004
    }
    ```
* **Constraint:** Only these normalized objects move forward
* **Broadcast:** Every final utterance pushed to ALL connected team members

### 9. Processing Pipeline (Tiered, Cost-Optimized)

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#56-trigger-evaluation--tiered-processing-pipeline)

The pipeline replaces the old regex-heavy approach with LLM-based classification. **No English-only pattern libraries.** Works in any language.

**Execution model:** After pre-filter, Tiers 1, 2, and 3 run **in parallel** (independent reads of the same utterance). Tier 4 runs after Tiers 2 and 3 resolve, gated by their combined output. See [meeting-mode.md §5.6.1](./meeting-mode.md#561-pipeline-orchestration--parallel-tier-execution).

Latency envelope (post pre-filter): `max(Tier1, Tier2, Tier3) ≈ 200 ms`; with Tier 4 when gated in: `≤ 720 ms`. Sequential execution would add Tier 1 + Tier 2 + Tier 3 (~350 ms) for no benefit.

#### Pre-filter (Free, <10ms)
* Kill noise: <3 words, pure acknowledgments, exact duplicates
* **Kills ~30-40% of utterances**

#### Tier 1: Structural Detection (Free, <50ms)
* **Language-agnostic ONLY**: date/time extraction, number extraction, org keyword blocklist matches, technical patterns (API keys, hashes, credentials)
* **Accelerator, NOT a gate** — fires instant alerts but everything passes through to Tier 2

#### Tier 2: Small LLM Classification (~$0.002/call, <200ms)
* **Single call to Gemini flash-lite** per utterance
* Input: utterance + speaker identity + last 2-3 utterances from same speaker (cross-utterance context)
* **Replaces ALL old regex pattern libraries** (risky language, pressure tactics, tone, scope creep, backtracking, vague language)
* Returns: intent, commitmentType, tone, riskSignals, extractedData, confidence, and `topicDelta` fields
* **Single semantic source of truth:** Tier 2 output drives both alert gating and topic-state updates (no duplicate semantic extraction in topic summarizer)
* Gate: filler/general with high confidence → STOP. Commitment/decision → write to commitment ledger
* **Works in ANY language natively**

#### Tier 3: Embedding Search + Novelty Check (~$0.00002/call, <100ms)
* Runs on **EVERY utterance** (safety net — catches what Tier 2 might miss)
* Uses a **shared utterance embedding** reused by topic assignment, Tier 2 cache similarity, and commitment-ledger writes
* Three parallel checks:
    * **Novelty check**: semantic deduplication within meeting
    * **Memory search**: pgvector search for past decisions, commitments, policies (client-scoped + org-wide)
    * **Commitment ledger search**: compare against ALL commitments from THIS meeting (catches contradictions from 40 min ago)
* If match found → **force Tier 4** regardless of Tier 2 label

#### Tier 4: Deep LLM Reasoning (~$0.02/call, 300-500ms)
* **Large model (Gemini Pro-class by default)**
* Only for high-signal utterances (~5-10% of total, ~8 calls per meeting)
* Rich context: utterance + speaker identity + topic summary + ring buffer + Tier 3 matches (historical + commitment ledger) + relevant constraints
* Returns: alert type, severity, message, suggestion, routing (shared/personal/both)
* Zod-enforced output schema

#### Three Model Tiers

| Model | Purpose | Cost/call | Example |
|-------|---------|-----------|---------|
| **Embedding** | Search, similarity, novelty | ~$0.00002 | text-embedding-004 (Gemini via @google/genai) |
| **Small LLM** | Classification, extraction | ~$0.002 | gemini-3.1-flash-lite-preview |
| **Large LLM** | Deep reasoning | ~$0.02 | gemini-2.5-pro |

**Total cost per 1-hour meeting: ~$0.30**

### 9.1 Speaker-Aware Processing
* **Current user's speech:** Parallel tier processing, lower confidence threshold (0.7), priority queue for LLM. Self-alerts → personal channel.
* **Other TEAM member's speech:** Standard processing. Team inconsistency checks against other commitments. Alerts → shared channel.
* **EXTERNAL speech:** Sequential processing, higher threshold (0.85). Scope creep, backtracking, pressure → shared channel.

### 10. Three Memory Layers

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#54-three-memory-layers)

| Layer | Scope | Duration | Purpose | Storage |
|-------|-------|----------|---------|---------|
| **Ring buffer** | Raw utterances | ~2 min | Context for Tier 4 LLM | In-memory |
| **Commitment ledger** | Commitments & decisions | Entire meeting | Intra-meeting contradictions | In-memory HNSW (realtime worker) + Redis snapshot |
| **pgvector** | Historical memory | All past meetings | Org memory contradictions | PostgreSQL |

* **Commitment ledger** is written LIVE by Tier 2 whenever it classifies a commitment/decision
* The primary index is an **in-memory HNSW** (one per session, in the realtime worker that owns the WebSocket). Plain Redis has no vector search, and a per-utterance RediSearch hop would add 1–2 ms on the hot path — in-memory HNSW resolves top-K in sub-ms with zero network cost.
* The Redis snapshot exists for crash recovery and observer fan-out (post-meeting worker, dashboard), not for the hot-path search.
* Status evolves: tentative → confirmed → contradicted → superseded (status changes fan out on `meeting.ledger.{sessionId}` Redis pub/sub)
* At meeting end: exported to PostgreSQL + pgvector (becomes organizational memory); in-memory index dropped, Redis snapshot deleted

### 11. Topic & State Tracking
* **Topic State:** Each utterance embedding is reused (shared with Tier 3), compared against topic centroids, assigned to existing or new topic
* **Topic summary text:** Built from Tier 2-driven reducer state in the hot path; optional LLM refinement is debounced/off-path on topic shift or significant deltas
* **Constraint Ledger:** Tracks explicit facts (dates, capacity, policy, dependencies) from preloaded data + meeting
* **Speaker State Tracker:** Rolling tone scores per speaker, engagement metrics, response patterns
    * Detects gradual tone shifts (escalation over 15 min)
    * Detects client disengagement (brief responses, declining frequency)
* **State Persistence:** All ledgers in Redis per session, accessible to all participants

### 12. Live LLM Invocation (Read-Only, Atomic Alerts)
* **LLM Characteristics:**
    * Tier 2: Small, fast model (Gemini flash-lite) for classification — every utterance
    * Tier 4: Large model (Gemini Pro-class) for reasoning — ~8 calls/meeting
* **Context for Tier 4:** Known constraints, recent commitments, topic summary, utterance, speaker identity, Tier 3 matches (historical + commitment ledger). **No full transcript.**
* **Structure:** Zod-enforced output schemas
* **UI Pattern:** Content-free "Checking..." indicator only; final alerts render atomically after full validation (no preliminary/progressive alert text)
* **Output:** Ephemeral alert with routing. **No persistence during meeting.**
* *Note: If slow or wrong → silently skipped.*

### 13. Ambient Awareness Layer

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#8-ambient-awareness-layer)

Non-intrusive signals visible to **all connected team members**:
* **Topic Indicator:** Shows current detected topic label, updates on topic shift
* **Constraint Counter:** Shows tracked constraints count, increments on new detection
* **Listening Heartbeat:** Visual confirmation audio is being processed
* **Participant List:** Shows who is connected, speaker identification status
* **These are NOT alerts.** They're ambient proof of awareness.

### 14. Alert Routing — Shared & Personal Channels

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#7-alert-routing--shared-vs-personal-channels)

Two Redis pub/sub channel types per session:

```
meeting.alert.{sessionId}.shared          → ALL team members
meeting.alert.{sessionId}.user.{userId}   → Only that user
```

Each Larity instance subscribes to both its personal channel and the shared channel.

**Routing logic:**
| Alert Category | Routing |
|----------------|---------|
| Self-contradiction (own) | Personal |
| Self-contradiction (team member) | Shared |
| Team inconsistency | Shared |
| Risky commitment (own) | Personal |
| Risky commitment (team member) | Shared |
| Scope creep | Shared |
| Client backtrack | Shared |
| Missing clarity | Shared |
| Information risk | Both (shared + personal to speaker) |
| Tone warning (own) | Personal |
| Tone warning (team member) | Shared |
| Pressure detected | Shared |
| Policy violation | Both |
| Client disengagement | Shared |
| Undiscussed agenda | Shared |

### 15. Alert Surfacing Rules
* **Short** — one sentence, actionable
* **Contextual** — reference what was just said
* **Dismissible** — swipe or click to dismiss
* **Auto-expire** — fade after 10-15 seconds (30s for critical)
* **Non-stacking** — max 2 visible at once, queue the rest
* **Visually distinguished** — shared alerts vs personal alerts have different indicators

**12 alert categories:**
`self_contradiction`, `team_inconsistency`, `risky_commitment`, `scope_creep`, `client_backtrack`, `missing_clarity`, `information_risk`, `tone_warning`, `pressure_detected`, `policy_violation`, `client_disengagement`, `undiscussed_agenda`

### 16. Silent Collaborator Behavior
* No interruption. No narration. No spam.
* **Surfaces only high-signal events.**
* Per-category confidence thresholds (policy_violation: 0.6, tone_warning: 0.85)
* *This is by mechanical design, not tuning.*

---

## PART IV — POST-MEETING MODE (AUTHORITATIVE)

### 17. Meeting Ends
* **Exit Triggers:** Host clicks "End Meeting", host's detected conferencing app closes or the captured audio sink goes silent for the configured grace period, inactivity timeout, all participants disconnect
* **Pre-exit:** Undiscussed agenda items checked (compare discussed topics vs calendar agenda)
* **State Transition:** Live mode off. **Memory writes enabled.** Async processing begins.

### 18. Transcript Consolidation
* **Input:** Full finalized transcript, **speaker identities** (TEAM with names + EXTERNAL with best-effort names), timestamps
* **Cleanup:** Deduplication, Topic segmentation, Sectioning
* **Speaker attribution:** Final speaker identity mappings persisted (including confidence scores)

### 19. Async Intelligence Pipeline (RabbitMQ)
* **Jobs:**
    * Decision extraction
    * Task generation
    * Deadline inference
    * Owner assignment
    * Risk summarization
    * Open questions
    * **Commitment ledger → PostgreSQL + pgvector** (live commitments become organizational memory)
    * **Final meeting summary generation** (with speaker-attributed highlights)
* **LLM Usage:** Larger models allowed. Full transcript allowed. **Evidence required.**

### 20. Memory & Knowledge Writes
* **Storage:** PostgreSQL (authoritative, client-scoped)
    * Versioned decision logs (Decision)
    * Task tables (Task)
    * Open questions (OpenQuestion)
    * Important points (ImportantPoint)
    * Meeting summary (Meeting.summary field)
    * **Commitments** (from commitment ledger, with final statuses)
    * **Speaker identity records** (who was in the meeting, TEAM vs EXTERNAL)
* **Embeddings:** pgvector (Decisions, ImportantPoints, PolicyGuardrails, **Commitments**)
* **Scope:** All business data is client-scoped (tenant isolation)
* *This becomes client memory, queryable across the org and searchable by Tier 3 in future meetings.*

---

## PART V — ASSISTANT / CHATBOX MODE

### 21. Chatbox Invocation
* **Modes:** Voice-first or Text fallback
* **Availability:** Usable during or outside meetings

### 22. Intent Classification
* **Determines:** Knowledge query, Task execution, Memory write request, Reminder, Calendar/Email/GitHub action

### 23. Knowledge Queries
* **Flow:** pgvector search (Decisions, ImportantPoints, Guardrails, **Commitments**) + Permission filtering + Client scope
* **LLM:** Answers via Gemini (`@google/genai`)
* **Constraint:** Read-only unless explicitly changed. Queries respect client boundaries.

### 24. Auto-Remembrance (Explicit Only)
* **Trigger:** User says "Remember this", "Save this", or "Add this to memory"
* **Flow:** Intent detected (regex) → LLM structures content (schema-bound) → Optional confirmation → System writes to DB + embeddings
* **Constraint:** **LLM never writes directly.**

### 25. Action Execution
* **Tools:** Calendar APIs, Email APIs, GitHub APIs, Task system
* **Guarantees:** Explicit, Logged, Reversible

---

## SYSTEM-WIDE GUARANTEES (NON-NEGOTIABLE)

1.  **Live LLM = Read-only.** No memory writes during meetings.
2.  **Memory is explicit, never inferred.** Only post-meeting pipeline writes canonical memory.
3.  **No raw STT reaches an LLM.** Always normalized first.
4.  **Real-time paths never block.** If slow → skip, don't queue.
5.  **Every memory has evidence.** Commitments, decisions, tasks all link to source utterances.
6.  **Every decision is versioned.** Full audit trail.
7.  **Multi-user by design.** Shared state, shared alerts, personal coaching — not bolted on.
8.  **Language-agnostic classification.** LLM-based, not regex-based. Works in Hindi, Hinglish, Tamil, English, any language.
9.  **Conservative defaults.** Unidentified speakers → EXTERNAL. Uncertain classifications → no alert. Missed edge cases → acceptable. False positives → unacceptable.

> **Final Summary:** Larity is a real-time multi-user meeting intelligence system delivered as a native desktop application (Tauri) with a web dashboard for review and admin. The host's desktop app captures OS-level system audio from whichever conferencing app is running — Zoom, Meet, Teams, Discord, anything — and streams it to a shared remote server. Speakers are identified by correlating each team member's local-mic VAD signals with Deepgram diarization timestamps (no voice models, no enrollment). Utterances flow through a four-tier processing pipeline (structural → small LLM → embedding search → large LLM), commitments are tracked in a live ledger across the entire meeting, alerts are routed to shared and personal channels across all connected team members, classification is language-agnostic by design, and organizational memory is only written after the meeting ends with full evidence chains.
