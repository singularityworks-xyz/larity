# LARITY — MEETING MODE (COMPLETE SPECIFICATION)

This is the **primary execution mode of the product**. Everything else (dashboard, memory, analytics) exists to support this.

---

## 1. What Meeting Mode Is

**Meeting Mode = a conservative, real-time, read-only intelligence loop with ambient awareness for multi-user team meetings.**

Core properties:

* Runs only while a meeting is active
* Never mutates long-term memory during the meeting
* Operates under strict latency budgets
* Optimized for **risk prevention**, not creativity
* Feels alive through ambient signals, not noise
* Conservative by design, responsive by engineering
* **Supports multiple team members in a shared session** — not just 1:1 meetings
* **Processing runs on a shared remote server**, not locally on any single machine

Think of it as a **flight control system** — silent when things are fine, immediate when they're not. Shared across the entire cockpit crew.

---

## 2. Multi-User Session Architecture

### 2.1 The Host Model

Real agency/team work involves multiple team members meeting with a client together over a conferencing tool (Zoom, Google Meet, Microsoft Teams, Slack Huddle, Discord, Jitsi, a dialed-in phone call bridged through the OS — whatever). Larity is a **native desktop application** that does not care which conferencing app is used. It supports multi-user sessions through a **host model**:

* **Larity is a native desktop application** (Tauri) installed on every team member's machine. There is **no browser extension**. Meeting platform doesn't matter — Larity captures host mic + OS-level system audio (loopback) from whichever app is producing the meeting audio on the host's machine.
* **One team member is the host** — they run Larity's desktop app and capture two local streams from their machine: host microphone (**logical capture channel 0**) and OS-level system audio loopback (**logical capture channel 1**)
* **Other team members join the same shared meeting session** — they connect to the session from their own desktop app but do NOT send system audio
* **All participants are remote** — everyone is on separate machines in the underlying meeting call (or even physically co-located, the conferencing platform is irrelevant to Larity)
* **The host's Larity instance is the single audio source** — it streams **tagged mono PCM** to the realtime server: each binary frame is **`byte 0 = 0` (mic) or `1` (system)**, followed by **16 kHz mono linear16** samples for that source only (see `packages/stt/src/dual-channel-session.ts`). The realtime worker opens **two** Deepgram live connections (one per logical source).

**Why host model:**
* **Two** Deepgram **live** connections per host session (mic + system), each **mono** — avoids interleaved multichannel coupling and per-source latency skew; still one host sender and one STT vendor
* No duplicate/conflicting transcriptions from multiple hosts
* Single source of truth for meeting audio **entering** the server
* **Platform-agnostic:** because capture is OS-level loopback, it works identically whether the host is on Zoom, Meet, Teams, Discord, a dialed-in phone call, or a future platform that doesn't exist yet — no per-platform integration work ever required

**Host failure:** If the host disconnects, meeting tracking stops. No failover in v1. This is acceptable — the host is typically the meeting organizer or team lead.

### 2.2 Session Join Flow

```
HOST:
  POST /meeting-session/start
    → Creates session record
    → Returns sessionId
    → Host begins audio capture + STT pipeline

TEAM MEMBER:
  POST /meeting-session/join
    → Joins existing session by meetingId
    → Returns sessionId + current session state
    → Subscribes to shared utterance/alert streams
    → Does NOT send system audio
    → May send mic audio for voice identification (see Section 3)
```

### 2.3 Session Data Structure

```ts
interface MeetingSession {
  sessionId: string
  meetingId: string                  // External meeting reference (calendar event ID, or synthetic if ad-hoc)
  orgId: string
  clientId: string                   // Which client this meeting is with
  hostUserId: string                 // The team member hosting
  participants: SessionParticipant[]
  status: "initializing" | "active" | "ending" | "ended"
  startedAt: number
  endedAt?: number

  // Preloaded context (see Section 4)
  preloadedContext: PreloadedContext
}

interface SessionParticipant {
  userId: string
  name: string
  role: "host" | "participant"
  joinedAt: number
  isConnected: boolean
}
```

---

## 3. Speaker Identification via Voice Embeddings

### 3.1 The Problem

With multiple team members and external clients all speaking in the same system-audio stream captured from the host's machine, the system needs to:

1. Identify which speaker is a **team member** vs **external client**
2. Identify **which specific team member** is speaking
3. Do this reliably across languages (Hindi, Hinglish, Tamil, English, etc.)

### 3.2 Rejected Approaches

**Mic on/off detection:** Unreliable. People don't mute between sentences.

**Mic audio matching (secondary STT per team member):** Would require a separate Deepgram connection per team member's mic. Expensive and fragile.

**Voice embeddings / voiceprints:** Each team member records a voice sample during onboarding; runtime audio is compared via cosine similarity. Rejected because:
- The meeting audio goes through the platform's codec and noise suppression (Zoom, Teams, Meet — each transforms the acoustic fingerprint). The enrollment recording is clean; the runtime audio is not. Cosine similarity breaks down.
- Requires enrollment before first meeting — cold-start friction.
- Works poorly for speakers who say very little (buffer never fills).
- Brittle to diarization index reassignment after long silences.
- Larity runs at OS level on every team member's machine anyway — there is a simpler, more reliable signal available.

### 3.3 Chosen Approach — VAD Speaking Signals

Since all team members run Larity on their own machines, each instance has direct access to that member's **local microphone**. This provides a reliable, platform-agnostic identity signal:

1. Each team member's Larity instance runs **local VAD (Voice Activity Detection)** on their own mic stream continuously during the session. The host's mic audio is also captured as channel 0 of the audio stream; VAD remains the identity signal for non-host TEAM members and the fallback signal if the dual-channel host path degrades to single-channel.
2. When VAD detects speech, the Larity instance sends a timestamped signal to the server via the existing WebSocket: `{ type: "vad_speaking", userId, ts }` (both `vad_speaking` and `vad_silence` edge events are sent; ts is `performance.now()`-derived monotonic wall clock).
3. The server **correlates VAD timestamps (after clock-offset reconciliation — see below) against Deepgram diarization timestamps**.
4. If exactly one team member's VAD overlaps with a diarization index's speech window → that index is assigned to that userId as **TEAM**.
5. If no team member's VAD overlaps → that index is **EXTERNAL** (client).
6. The mapping (`channel + diarizationIndex → SpeakerIdentity`) is **cached for the session** — once identified, subsequent utterances from that channel/index resolve instantly, subject to the reassignment-merge logic below.
6a. **Host channel short-circuit:** When dual-channel capture is active, any utterance emitted from channel 0 is assigned to the host's `SpeakerIdentity` directly. No VAD correlation is needed for the host channel. VAD correlation continues on channel 1 for non-host TEAM members and EXTERNAL speakers.
7. If multiple team members speak simultaneously → correlation is ambiguous, defer until unambiguous signal.
8. External speakers get names from **calendar data** (best-effort).
9. **No voiceprint storage, no enrollment, no ML model required.**

> **Why this works:** Larity captures OS-level system audio regardless of platform (Zoom, Meet, Teams, etc.). The host mic channel is captured on the same machine as loopback and is identified directly. Other team members' local mic VAD signals are aligned to the server audio-ingestion clock through rolling clock-offset reconciliation, so timing correlation remains consistent across meeting platforms.

#### 3.3.1 Clock-Offset Reconciliation

Client-side timestamps cannot be trusted directly — they originate from different machines, drift against each other, and are subject to process suspension (e.g. laptop sleep). The server maintains a **per-client rolling clock offset** so VAD timestamps align with the server's audio ingestion clock:

- On every inbound client message (heartbeat or VAD event), the server computes `sampleOffset = serverReceiveTs - clientSendTs - halfRTT`.
- The server keeps a **rolling median of the last 30 samples** per client as the authoritative offset (median, not mean — robust to jitter spikes).
- All VAD timestamps from that client are adjusted by `offset` before correlation: `adjustedTs = vadEvent.ts + clientOffset`.
- Correlation window: ±250ms around the diarization word's start time (previously ±300ms; tighter because offset is corrected, not tolerated).
- If offset median shifts by >500ms within a short window (e.g. laptop resumed from sleep), the server marks recent VAD signals as untrusted for ~2s and defers speaker assignment for utterances in that gap.

#### 3.3.2 Diarization Index Reassignment — Merge Logic

Deepgram (and diarization engines in general) will **reassign speaker indices after long silence gaps or voice changes** — the same physical speaker may appear as `speaker=0` for the first ten minutes and `speaker=3` after a silence. The server must not treat this as a new speaker.

Every time a new diarization index appears, the server runs a **merge check** before creating a new SpeakerIdentity:

```
When utterance arrives with diarizationIndex=N that has no cached SpeakerIdentity:
  1. Run VAD correlation for this utterance → candidate userId (or EXTERNAL)
  2. Look up existing SpeakerIdentity with same candidate userId (or same EXTERNAL heuristic)
  3. If found AND gap since that identity's last utterance > 15s:
        → merge: map diarizationIndex=N onto existing SpeakerIdentity.speakerId
        → append N to that identity's `diarizationIndices` set
        → do NOT emit "new speaker" event
  4. If found AND gap < 15s AND VAD correlation conflicts:
        → genuinely a different speaker, create new SpeakerIdentity
  5. If not found:
        → create new SpeakerIdentity
```

The `SpeakerIdentity` therefore owns a **set** of per-channel diarization indices, not a single index, and the cache is `Map<channel:diarizationIndex, speakerId>` pointing into a `Map<speakerId, SpeakerIdentity>`. Single-channel fallback uses `channel=0` for all indices.

#### Conservative Default

Until a team member's VAD signal has been correlated to a diarization index, that index defaults to **EXTERNAL**. Once identified, buffered utterances are retroactively reprocessed with the correct identity.

### 3.4 Speaker Identity Model

This replaces the binary `"YOU" | "THEM"` model entirely:

```ts
interface SpeakerIdentity {
  speakerId: string               // Unique within this meeting session
  type: "TEAM" | "EXTERNAL"
  userId?: string                 // If TEAM, linked to User record
  name: string                    // Display name
  diarizationIndices: {
    channel: 0 | 1
    index: number
  }[]                             // All Deepgram channel/index pairs that map to this identity
                                  //   (diarization reassigns indices after silences;
                                  //    see §3.3.2 merge logic)
  isCurrentUser: boolean          // Is this the person viewing this Larity instance?
  confidence: number              // How confident the identification is (0-1)
  lastUtteranceTs: number         // Used by the merge heuristic
}
```

**Key design points:**

* `isCurrentUser` determines which alerts are "self" alerts vs "team" alerts for each Larity instance
* A team member viewing their Larity instance sees their own self-contradictions as personal alerts, but sees other team members' contradictions as shared alerts
* `type: "EXTERNAL"` encompasses all non-team speakers — clients, their colleagues, anyone not in the org

### 3.5 Speaker Identification Architecture

Speaker identification uses **local VAD signals** correlated with Deepgram diarization timestamps on the server. No voice embedding models, no voiceprint enrollment, no ML inference required.

* **Client-side (each team member's Larity instance):**
  * Runs VAD on the local mic stream (`@ricky0123/vad-web` / Silero VAD, Rust-side WebRTC VAD, or equivalent). Rust-side VAD is preferred once the host mic is already captured for ch0, because it avoids opening the microphone twice.
  * Emits `{ type: "vad_speaking" | "vad_silence", userId, sessionId, ts }` via existing WebSocket connection
* **Server-side (`packages/meeting-mode/src/speaker-identification/`):**
  * Maintains `VadState` per session: `Map<userId, { isSpeaking: boolean; startTs: number }>`
  * On each Deepgram word/utterance from channel 0: assigns the host identity directly
  * On each Deepgram word/utterance from channel 1: checks which team member's VAD was active at that timestamp (±250ms offset-corrected window)
  * If exactly one member → assigns that channel/index pair to that userId (TEAM)
  * If none → EXTERNAL by default
  * Caches result: `Map<channel:diarizationIndex, SpeakerIdentity>` — all future utterances from that channel/index pair resolve instantly
* **Latency:** Identification resolves within <50ms of utterance finalization for actively speaking team members
* **Platform-agnostic:** Works identically on Zoom, Meet, Teams, or any OS-level audio capture
* **No enrollment required:** Zero setup beyond having Larity open with mic permission

---

## 4. Entering Meeting Mode

### Trigger

Larity is a native desktop app (Tauri). Meeting Mode is engaged by the host explicitly — there is no browser extension and no automatic start.

* **Optional pre-announcement (ambient):** When a calendar event is within T-5 min, or when the desktop app detects a known conferencing app is in a call state (e.g. Zoom/Meet/Teams window focused with active audio output), the app surfaces a subtle tray/overlay prompt: *"Start Meeting Mode?"*. This is a prompt, never an auto-start.
* **Host** explicitly clicks **"Start Meeting Mode"** in the desktop app (tray icon, overlay, or main window).
* Other team members' desktop apps detect the active session (via pushed presence or their own tray prompt from the control API) and click **"Join Meeting Session"** (or are auto-joined if pre-configured for this client).

Consent is always explicit. System audio loopback never starts without the host's click.

---

### Initialization Sequence (exact order)

#### Step 1 — Session Creation (Host Only)

* Desktop app calls `POST /meeting-session/start` on the remote control API
* Backend creates a `meetingSession` record on the **remote server**
* Session ID becomes authoritative
* Host's desktop app arms the OS audio-capture layer (see Step 6)

#### Step 2 — Team Member Join

* Other team members' Larity instances call `POST /meeting-session/join`
* They receive sessionId + current session state
* They subscribe to shared streams (utterances, alerts)
* They optionally provide mic audio for voice identification (one-time per session)

#### Step 3 — Context Preload (critical)

Before any audio is processed, the server preloads:

* Open decisions (last N weeks, client-scoped)
* Known constraints (delivery, legal, capacity)
* Active policy guardrails (org-wide)
* Unresolved risks
* Org-level rules
* **Client name list** (for information leak detection)
* **Team roster for this session** (userIds, display names — needed so incoming VAD speaking signals can be correlated to known team members; no voice models are loaded)
* **Prior commitments** (from previous meetings with same client)
* **Org-configured keyword blocklists** (for Tier 1 structural detection)

This data is cached in memory on the server for the session.

#### Step 4 — Predictive Constraint Pre-embedding

* Parse meeting agenda (if available from calendar)
* Identify likely topics from calendar context
* Pre-embed constraint matches for predicted topics
* Build hot cache of topic → constraint mappings

When topic shifts occur, relevant constraints are already loaded.

#### Step 5 — Short-term Buffers Initialized

* Ring buffer (raw utterances, last ~2 minutes)
* Topic state map
* Constraint ledger
* **Commitment ledger** (all TEAM + EXTERNAL speakers, with embedding vectors)
* **Speaker state tracker** (rolling tone scores per speaker)
* **Topic completeness tracker**
* **Alert state manager** (debounce, queue, active alerts)
* Trigger debounce state

#### Step 6 — Audio Pipeline Armed (Host Only)

* The host's machine arms **two simultaneous capture streams** via the Tauri/Rust audio-capture module:
    * **Channel 0 — host microphone:** local mic captured pre-conferencing-codec. This makes the host's own utterances clean and gives the server a deterministic host identity channel.
    * **Channel 1 — OS-level system loopback:** loopback capture of the system mixer output — whatever app is producing the meeting audio (Zoom, Meet, Teams, Discord, Slack, a SIP phone, browser tab, anything). Implementation per platform:
        * **Windows:** WASAPI loopback (`wasapi-rs`, or `cpal`'s loopback-capable WASAPI path).
        * **macOS:** ScreenCaptureKit audio (macOS 13+) / Core Audio process tap, or fallback to a user-installed virtual device (BlackHole / Loopback).
        * **Linux:** PipeWire / PulseAudio monitor source of the default sink.
* Both streams are downmixed to mono, resampled to 16 kHz, chunked at **50 ms** frames. **No interleaved stereo blob:** each frame is tagged **mic** or **sys** and sent on the host WebSocket as **`[tag: u8][mono linear16…]`** (see §2.1 and `dual-channel-session.ts`).
* PCM is streamed over the realtime WebSocket to the remote server (**Rust-native path preferred**; avoid base64/JS hot path in production). Audio bytes never go through Redis.
* The realtime worker opens **two** Deepgram live connections — one per logical source — each with `diarize=true`, `channels=1`, `encoding=linear16`, `sample_rate=16000`.
* **Single-stream fallback (if implemented):** if one capture path fails, send only the surviving source with the correct tag and reduce to one Deepgram connection or idle the other; document in ops. VAD correlation on channel 1 behaves as in §3.3.

Team members do NOT arm the audio-capture layer — their desktop apps only send local-mic VAD signals (see Section 3.3) and receive processed utterances/alerts from the server.

#### Step 7 — Ambient UI Activated (All Participants)

* Topic indicator initialized (empty state)
* Constraint counter set to preloaded count
* Listening heartbeat enabled
* **Participant list shown** (who's in the session)

At this point, Meeting Mode is **armed and visibly alive** for all connected team members.

---

## 5. Live Meeting Loop

This loop runs continuously on the **remote server** until the meeting ends. All connected team members receive results in real-time.

---

### 5.1 Audio → STT → Utterance Pipeline

**For every audio chunk (host sends):**

1. Audio arrives from the host as **tagged mono** frames: **`tag=0`** = host mic (**logical capture channel 0**), **`tag=1`** = system loopback (**logical capture channel 1**). Conferencing platform is opaque to the server.
2. Realtime **`createDualChannelSession`** routes each frame to **its** Deepgram socket — both use `diarize=true`, `channels=1`.
3. STT emits partial hypotheses **with logical capture channel + diarization indices** (per mono stream)
4. **Speculative processing begins on partials** (see 5.2)
5. Normalizer waits for `isFinal = true`
6. Speaker identification resolves:
   * Channel 0 → host `SpeakerIdentity` directly
   * Channel 1 → **VAD correlation + reassignment-merge** (see §3.3.1–3.3.2): the channel/index pair is mapped to a `SpeakerIdentity` using the clock-offset-corrected VAD state. If no VAD-team match → EXTERNAL.
7. Final utterance created:

```json
{
  "utteranceId": "u_193",
  "channel": 1,
  "speaker": {
    "speakerId": "spk_3",
    "type": "TEAM",
    "userId": "user_rahul",
    "name": "Rahul",
    "diarizationIndices": [{ "channel": 1, "index": 2 }],
    "isCurrentUser": false,
    "confidence": 0.92
  },
  "text": "We can ship by Friday",
  "timestamp": 1730000123
}
```

Only **final utterances** trigger alerts. Speculative work accelerates response.

**Utterance broadcast:** Every final utterance is pushed to all connected team members via their WebSocket subscriptions. Each Larity instance resolves `isCurrentUser` locally based on the viewer's userId.

---

### 5.2 Speculative Processing (Latency Optimization)

**Do not wait for `isFinal`.** On partial hypotheses:

```
Partial utterance arrives (confidence > 0.7)
  → Start intent classification speculatively
  → Identify likely topic from partial text
  → Pre-fetch relevant constraints for that topic
  → Pre-warm LLM connection if high-signal keywords detected

When isFinal arrives:
  → If text matches speculation: use pre-computed results (200-300ms saved)
  → If text differs significantly: discard speculative work, process fresh
```

**Success rate:** ~85% of speculative work is usable. 15% discard rate is acceptable.

---

### 5.3 Topic Tracking

Each utterance is:

* Embedded (cheap embedding model)
* Compared against existing topic centroids
* Assigned to existing topic OR starts new topic

Topic state structure:

```ts
interface TopicState {
  topicId: string
  label: string                    // Human-readable: "Delivery timeline"
  summary: string                  // Compressed evolving summary
  constraintsMentioned: Constraint[]
  commitmentsMentioned: Commitment[]
  riskFlags: RiskFlag[]
  centroid: number[]               // Embedding centroid
  lastUpdated: number

  // Topic Completeness Tracking
  completeness: {
    hasOwner: boolean              // Was an owner assigned?
    ownerName?: string             // Who owns this?
    hasDeadline: boolean           // Was a deadline set?
    deadline?: string              // What's the deadline?
    hasActionItems: boolean        // Were next steps defined?
    actionItems: string[]          // List of action items
    hasExplicitConfirmation: boolean // Was there mutual agreement?
  }
}
```

**Ambient UI update:** Topic indicator shows current `label`. Updates on topic shift.

**Completeness check:** On topic shift, evaluate outgoing topic's completeness. Alert if critical fields missing.

---

### 5.4 Three Memory Layers

The meeting mode uses **three distinct memory layers** to catch contradictions and risks across different time scales:

| Layer | Scope | Duration | Purpose | Storage |
|-------|-------|----------|---------|---------|
| **Ring buffer** | Raw utterances | Last ~2 minutes | Conversation context for Tier 4 LLM prompt | In-memory |
| **Commitment ledger** | Commitments & decisions only | Entire current meeting | Catch intra-meeting contradictions (e.g., Rahul says "2 weeks" at T+5, Raj says "2 months" at T+45) | Redis |
| **pgvector (PostgreSQL)** | Historical decisions, policies, important points | All past meetings | Catch contradictions with organizational memory | PostgreSQL + pgvector |

**Why three layers:** If Rahul makes a commitment at T+5 minutes and Raj contradicts it at T+45 minutes, the 2-minute ring buffer doesn't catch it. The commitment ledger, which spans the entire meeting, does. And if a commitment contradicts something from a meeting 3 weeks ago, pgvector catches that.

### 5.4.1 Ring Buffer

```ts
interface RingBuffer {
  utterances: Utterance[]          // Last ~2 minutes of raw utterances
  maxAge: 120_000                  // 120 seconds
  maxSize: 50                      // Max utterances stored

  // Used for:
  // - Providing conversation context to Tier 4 LLM
  // - Cross-utterance pattern detection
  // - Speaker response length tracking
}
```

### 5.4.2 Commitment Ledger (In-Memory HNSW + Redis Snapshot, Entire Meeting)

The commitment ledger is the key mechanism for catching **intra-meeting contradictions**, including:
- **Self-contradictions** (same person contradicts themselves)
- **Team inconsistencies** (two team members contradict each other in front of the client)
- **Client backtracking** (external speaker changes previously agreed terms)

**Storage design (critical — not plain Redis):**

Plain Redis has no native vector search, and calling pgvector for every Tier 3 intra-meeting lookup adds a network hop + transaction overhead on the hot path. Since the ledger is small (at most a few hundred commitments per meeting) and session-scoped, we keep it **in-process** inside the realtime worker that owns the session:

| Layer | What | Why |
|-------|------|-----|
| **Primary: in-memory HNSW index** | `hnswlib-node` (or equivalent), one index per session, keyed by `sessionId`, holding `{ id, embedding, commitment }` | Sub-millisecond top-K search, zero network cost, no serialization on the hot path |
| **Secondary: Redis snapshot** | `meeting:ledger:{sessionId}` — JSON snapshot (vectors optional/base64); **debounced** writes (**`LEDGER_SNAPSHOT_DEBOUNCE_MS`**) + flush on session close; immediate write when debounce is 0 | Survives worker restart, readable by other services (post-meeting worker, observability); **`ledger_snapshot_flushes_total`** metric |
| **Tertiary: PostgreSQL + pgvector** | Written at meeting end by the post-meeting worker | Becomes organizational memory for future meetings |

**Why not keep it all in Redis:**
- Redis vector search (`FT.SEARCH` via RediSearch) is an option, but requires the RediSearch module, adds per-query RTT (~1-2ms even on localhost), and forces embedding serialization on every write. An in-process HNSW is ~50-100× faster for this workload size.
- Session affinity is already guaranteed by the realtime worker holding the WebSocket — the session's ledger naturally lives where it's needed.

**Failure/restart semantics:**
- If the owning realtime worker crashes, the session is terminated and the client reconnects to a new worker. The new worker hydrates the HNSW index from the Redis snapshot (commitments only) and re-embeds any commitments that lost their vectors. This takes <1s for a few hundred commitments.
- Redis snapshot TTL matches meeting session TTL. On graceful meeting end, the snapshot is drained into the post-meeting pipeline, then deleted.

```ts
interface Commitment {
  id: string
  statement: string                // "Ship by Friday"
  normalizedStatement: string      // Canonical form for comparison
  speaker: SpeakerIdentity         // Full speaker identity (TEAM/EXTERNAL, userId, name)
  topicId: string
  type: CommitmentType
  status: "tentative" | "confirmed" | "contradicted" | "superseded"
  timestamp: number
  utteranceId: string
  embedding: number[]              // Embedding vector for similarity search

  // For contradiction detection
  relatedCommitments: string[]     // IDs of commitments this relates to
  contradicts?: string             // ID of commitment this contradicts
  supersedes?: string              // ID of commitment this replaces

  // Extracted structured data (when applicable)
  extractedData?: {
    deadline?: string              // ISO date if timeline commitment
    quantity?: number              // If numeric commitment
    scope?: string[]               // If scope-related
    amount?: number                // If price-related
    currency?: string              // Currency for price commitments
  }
}

type CommitmentType =
  | "timeline"                     // "We'll deliver by Friday"
  | "scope"                        // "We'll include feature X"
  | "resource"                     // "I'll assign 2 developers"
  | "price"                        // "The cost will be $X"
  | "capability"                   // "We can do X"
  | "limitation"                   // "We can't do X"
  | "dependency"                   // "This depends on Y"
  | "general"                      // Other commitments
```

**Commitment Ledger Lifecycle:**

1. **Written live during the meeting** by Tier 2 whenever it classifies a commitment or decision — insert into the session's in-memory HNSW index + **debounced** Redis snapshot flush (**`LEDGER_SNAPSHOT_DEBOUNCE_MS`**; pub/sub insert event remains synchronous).
2. **Stores embedding vectors** for each commitment in the HNSW index (for similarity search in Tier 3). The Redis snapshot can store vectors as base64-packed Float32 (optional — only needed if a replacement worker needs to avoid re-embedding on restart).
3. **Status evolves during the meeting:**
   - `tentative` → initial state when commitment is made
   - `confirmed` → when the other party agrees or the speaker reaffirms
   - `contradicted` → when a conflicting commitment is detected
   - `superseded` → when the speaker explicitly revises (not a contradiction — an intentional update)
   - Status changes update in-memory state immediately; **debounced** Redis snapshot flush + fan-out on `meeting.ledger.{sessionId}` pub/sub (same pattern as inserts).
4. **Searched by Tier 3** on every commitment/decision utterance via in-memory HNSW top-K (sub-ms).
5. **At meeting end:** Handed off to post-meeting pipeline → written to PostgreSQL + pgvector → becomes organizational memory for future meetings. The in-memory index is dropped; Redis snapshot is deleted after successful persistence.

### 5.4.3 pgvector (PostgreSQL, Historical)

Searched at Tier 3 for every non-filler utterance. Contains:

* Past decisions (client-scoped)
* Past commitments (client-scoped)
* Policy guardrails (org-wide)
* Important points (constraints, warnings)

Top-K results with similarity > threshold are retrieved and passed to Tier 4 if a match is found.

---

### 5.5 Constraint Ledger

Separate from commitments. Tracks **explicit factual constraints**:

```ts
interface Constraint {
  id: string
  type: "date" | "capacity" | "policy" | "dependency" | "legal"
  value: string                    // "QA capacity limited to 60%"
  source: "preloaded" | "meeting"  // Where it came from
  utteranceId?: string             // If from meeting
  speaker?: SpeakerIdentity        // Who stated it
  confidence: number
  topicIds: string[]               // Which topics reference this
}
```

**Ambient UI update:** Constraint counter increments when new constraint detected.

---

### 5.5.1 Utterance merger and publish timing

After a **STT final**, meeting-mode builds one `Utterance`, **starts** a Gemini **`embeddingPromise`** (embed runs concurrently with work ahead of publish), **`TopicManager.assignTopic`** awaits that promise so topic centroids always see a vector, then **`UtteranceMerger`** decides what to publish to **`meeting.utterance.*`** before the tiered pipeline runs.

**Two independent knobs** (`packages/meeting-mode/src/env.ts`; tests may override `mergerGroupingMs` / `mergerPublishGapMs` / legacy `mergerGapMs` on **`UtteranceFinalizer`**):

| Variable | Purpose | Default |
|----------|---------|---------|
| **`MERGE_GROUPING_MS`** | Maximum silence between same-speaker finals for **in-memory text merge** (same `speakerId`, gap measured from previous segment **audio end**). Legacy alias: **`MERGE_GAP_MS`** when `MERGE_GROUPING_MS` is unset. | 5000 ms |
| **`MERGE_PUBLISH_GAP_MS`** | After the pending segment’s **audio end**, if no merge sibling arrives, **flush Redis publish** after this delay so transcripts/alerts are **not** held for the full grouping window. | ~700 ms |

- **Same-speaker merge:** Next final same **`speakerId`** within **`MERGE_GROUPING_MS`** after prior audio end → **single merged** utterance (one publish).
- **Otherwise:** Pending text publishes first (subject to **`MERGE_PUBLISH_GAP_MS`** timer); new segment becomes pending.
- **Timers:** Pending flush schedules **`pendingEndMs + MERGE_PUBLISH_GAP_MS`**; each new final **clears and reschedules**. **`closeSession`** cancels the timer, **`flush()`** publishes any remainder, then **awaits in-flight `onUtterancePublished` handlers** so constraint snapshots / pipeline side-effects finish before topic teardown.

**Throughput:** `publishUtterance` does **not** await handlers between finals (failures logged). **`MeetingPipelineEngine.evaluateUtteranceQueued`** chains evaluation **per `sessionId`** (FIFO) so bursts do not block the next finalize behind Tier 2/Tier 4 latency.

Prometheus: **`finalizer_embed_duration_ms`**, **`finalizer_publish_wait_ms`** (finalize → Redis utterance publish).

---

### 5.6 Trigger Evaluation — Tiered Processing Pipeline

This is the core intelligence pipeline. For each finalized utterance, it runs through four tiers.

**Key design points:**
- Tier 1 is purely structural/language-agnostic.
- Tier 2 uses **Groq** (`GROQ_TIER2_MODEL`) with **`response_format: json_schema`** (`strict: true`) — **not** Gemini on the hot path (Gemini remains embeddings + Tier 4). Provider rules require **every property key** in **`extractedData`** and in a non-null **`topicDelta`** object to be present; unused slots are **`null`** (Zod strips nulls after parse).
- Tier 2 is the **single per-utterance semantic source of truth** (alerts + topic deltas).
- Tier 3 runs on every post-filter utterance as a safety net (short-circuits pgvector when preload context is absent **and** the commitment ledger search is empty).
- Tier 4 is deep reasoning, gated by Tier 2/Tier 3 output.
- Topic-summary LLM calls are **off the hot path** and only used for asynchronous refinement.
- **Tier 1, Tier 2, Tier 3, and constraint extraction run together** — **`constraintManager.processUtterance`** shares the same `Promise.all` as tiers (regex on raw text; independent of tier outputs). Tier 4 runs **after** they resolve. See §5.6.1.
- **Session caches:** Meeting **context payload** is fetched once in **`ensureSessionHydrated`** and reused from **`SessionPipelineState`**; **`CostManager`** serves **`getSessionCost`** from a short-TTL **hot cache** plus **`primeSessionCost`** on hydrate (**`COST_CAP_CACHE_TTL_MS`**).
- **Ledger snapshots:** Redis **`SET`** for commitment + constraint ledgers is **debounced** (**`LEDGER_SNAPSHOT_DEBOUNCE_MS`**); forced flush on session close. Small ledger events still publish on **`meeting.ledger.*` / `meeting.constraint.*`** as today.
- **Speaker-state alerts** publish via **`Promise.all`**; **`AlertPublisher`** is **cached per `sessionId`** in **`index.ts`** for Tier 4 / behavioral publishes.

#### Pre-filter (Local, Free, <10ms)

Before any tier processing, kill obvious noise:

```
Utterance arrives
  → Less than 3 words? → DROP
  → Pure acknowledgment? ("ok", "yeah", "mm-hmm", "right") → DROP
  → Exact duplicate of recent utterance? → DROP
  → Passes pre-filter → Continue to tiers
```

**Kills ~30-40% of utterances.** These are not worth any processing at all.

#### Tier 1: Structural Detection (Free, <50ms)

**ONLY language-agnostic structural patterns.** No English-specific regex libraries. No "risky language" patterns. No "pressure tactic" patterns. Those are all handled by the LLM in Tier 2.

Tier 1 handles things that are **structurally identifiable** without understanding language:

| Check | Method | Response |
|-------|--------|----------|
| Date/time extraction | Number/calendar format parsing | Instant note — extracted dates logged |
| Number extraction | Numeric pattern recognition | Instant note — "$500", "100 rupay", "40%", "3 developers" |
| Exact blocklist matches | Org-configured keyword set | Instant alert — specific client names, NDA terms |
| Technical patterns | Structural regex | Instant warning — API keys, SSH keys, long hashes, credentials |
| Org-configured keyword blocklists | Exact/fuzzy match | Instant alert — organization-specific terms |

**Critical design principle:** Tier 1 is an **accelerator**, NOT a gate. Everything passes through to Tier 2 regardless of Tier 1 results. Tier 1 just fires instant alerts for the things it can catch immediately. It does not stop or filter utterances.

**Why language-agnostic only:** The old approach had hundreds of English regex patterns for risky language, pressure tactics, emotional indicators, etc. These:
- Break completely for Hindi, Hinglish, Tamil, and other languages
- Can't catch semantic meaning ("that's a very aggressive timeline" doesn't match any pattern)
- Produce false positives on benign uses of pattern-matched words
- Are maintenance nightmares (hundreds of patterns to tune)

All semantic understanding is now in Tier 2 (small LLM).

#### Tier 2: Semantic Classification via Small LLM (~$0.002/call, <200ms)

**Single call via Groq** (`GROQ_TIER2_MODEL`, default `openai/gpt-oss-120b`) per utterance that passes the pre-filter, using **`json_schema`** structured outputs (`Tier2Classification`, **`strict: true`**). This is the primary classification layer that replaces ALL the old regex pattern libraries.

**Schema constraint:** Groq rejects schemas where an `object` lists `properties` without a `required` array covering **every** key — hence **`extractedData`** and non-null **`topicDelta`** are modeled as **all keys required** with **`string | null`** / **`number | null`**; the app strips **`null`** after validation so downstream code keeps optional-field ergonomics.

**Input to the LLM:**

```ts
interface Tier2Input {
  utterance: string                           // The current utterance
  speaker: SpeakerIdentity                    // Who said it
  recentSameSpeaker: string[]                 // Last 2-3 utterances from same speaker
                                              // (for cross-utterance pattern detection)
  topicLabel?: string                         // Current topic if known
}
```

**Why include last 2-3 same-speaker utterances:** Cross-utterance signals matter. A single utterance "that's fine" is benign. But "that's fine" after the speaker said "I already explained this twice" and "you're not listening" is frustrated acquiescence. The LLM needs this short window to catch these patterns.

**Output (structured, Zod-enforced):**

```ts
interface Tier2Classification {
  intent: "commitment" | "decision" | "question" | "concern" | "filler" | "general"
  commitmentType: "timeline" | "scope" | "resource" | "price" | "capability" | null
  tone: "neutral" | "defensive" | "aggressive" | "hesitant" | "confident"
  riskSignals: string[]                       // Free-form risk descriptions
                                              // e.g., ["unconditional promise", "minimizing complexity"]
  extractedData: {
    deadline?: string                         // ISO date or relative ("next Friday")
    quantity?: number
    scope?: string
    amount?: number
    currency?: string
  }
  topicDelta?: {
    labelHint?: string                        // Optional topic label hint
    decision?: string                         // Canonicalized decision candidate
    commitment?: string                       // Canonicalized commitment candidate
    openQuestion?: string                     // Unresolved question candidate
    risk?: string                             // Risk statement candidate
    owner?: string                            // Ownership extraction candidate
    deadline?: string                         // Deadline extraction candidate
  }
  confidence: number                          // 0-1
}
```

**What Tier 2 replaces (all the old pattern libraries):**
- Risky language patterns (unconditional commitments, underestimation, open-ended promises)
- Pressure tactic patterns (social proof, artificial urgency, authority pressure, guilt)
- Emotional indicator patterns (defensive, over-apologetic, reactive, dismissive, frustrated)
- Scope creep patterns ("can you also", "while you're at it", "I assumed it was included")
- Backtracking patterns ("actually we need", "on second thought", "I know we said X but")
- Vague language patterns ("soon", "ASAP", "someone should", "we'll figure it out")

**All of these work in ANY language natively** because LLMs are multilingual. No more English-only regex.

**Gate logic after Tier 2:**
- If `intent` is `"filler"` or `"general"` with no `riskSignals` AND `confidence > 0.8` → **STOP** (don't proceed to Tier 4)
- If `intent` is `"commitment"` or `"decision"` → **ALSO write to Commitment Ledger in Redis immediately** (with the shared utterance embedding)
- Everything continues to Tier 3 regardless (Tier 3 is a safety net)

**Tier 2 as topic-state source (non-redundant design):**
- Topic state reducer consumes `topicDelta` from Tier 2 for deterministic live updates.
- Topic summary text is generated from reducer state first (no per-utterance summarization call).
- Optional LLM summary refinement runs asynchronously on topic shift/topic close/significant semantic delta only.
- If refinement fails or times out, live topic state remains correct and alerting latency is unaffected.

**Cost:** ~$0.002 per call × ~72 calls per hour-long meeting (after pre-filter) = **~$0.14 per meeting for Tier 2**

#### Tier 3: Embedding Search + Novelty Check (~$0.00002/call, <100ms)

**Runs on EVERY utterance that passed the pre-filter** — not just commitments. This is a safety net. Even if Tier 2 misclassified something as filler, Tier 3's embedding search can catch it.

Three logical checks (implementation runs memory pgvector lookups **in parallel** via `Promise.all`; novelty + ledger search are coordinated inside **`Tier3SearchEngine.evaluate`**):

**a) Novelty check:**
- Is this utterance semantically new within the current meeting?
- Embedding-based deduplication against recent utterances
- If it's a near-duplicate of something already processed → skip

**b) Memory search (the key addition):**
- Vector search against pgvector for:
  - Past decisions (client-scoped)
  - Past commitments (client-scoped)
  - Policy guardrails (org-wide)
  - Important points (constraints, warnings)
- Top-K results with similarity > threshold
- This is how the system catches conflicts with **organizational memory** — things said weeks or months ago

**c) Commitment ledger search:**
- Compare the current utterance's embedding against ALL commitments from THIS meeting's ledger
- This is how contradictions from 40 minutes ago get caught
- Especially important for **team inconsistency** detection (Rahul says "2 weeks", then 40 minutes later Raj says "2 months")

**Tier 3 signal — `forceTier4`:**
Embedding search sets **`forceTier4 = true`** when there is at least one **memory** hit or **commitment ledger** hit above similarity threshold. That is a **hint** that the line may contradict org memory or an in-meeting commitment.

**Combined Tier 4 gate (implemented):** Tier 4 runs only if Tier 2 does **not** request “stop deep reasoning” **and** either the utterance is **high-signal** from Tier 1/2 **or** Tier 3 set **`forceTier4`**:

```
shouldStopForDeepReasoning =
  intent ∈ {filler, general} ∧ riskSignals.length === 0 ∧ confidence > 0.8

highSignal =
  tier1.blocklistHit ∨ tier1.technicalHit ∨
  intent ∈ {commitment, decision, concern} ∨ riskSignals.length > 0

runTier4 = ¬shouldStopForDeepReasoning ∧ (highSignal ∨ forceTier4)
```

So **`forceTier4` still matters** whenever the utterance is not a high-confidence filler/general line: it can turn on Tier 4 even when Tier 2’s headline intent looks low-signal but embeddings matched the ledger/memory. Conversely, **`forceTier4` alone does not invoke Tier 4** on **`shouldStopForDeepReasoning`** (avoids Gemini on “hi / sounds good” when spurious ledger similarity fires).

Legacy doc lines that said “force Tier 4 regardless of Tier 2” apply only to **`highSignal`** and **`forceTier4` inside the parentheses** above — not to the veto from **`shouldStopForDeepReasoning`**.

**Cost:** ~$0.00002 per embedding call × ~80 calls per meeting = **~$0.002 per meeting for Tier 3**

#### Tier 4: Deep LLM Reasoning (~$0.02/call; wall-clock timeout configurable)

**Large model** (default from `GEMINI_TIER4_MODEL`; typically Pro-class vs Flash Tier 2). Only runs when **`runTier4`** is true (§5.6.1 gate). Typical share **~5-10%** of post-filter finals; actual count depends on content and embeddings.

**Timeout:** Gemini call is raced with **`GEMINI_TIER4_TIMEOUT_MS`** (default **1500** ms); on timeout / parse failure / schema failure the pass **fail-silently** (no alert).

**Rich context assembly for Tier 4:**

```ts
interface Tier4Context {
  // The utterance being evaluated
  utterance: string
  tier2Classification: Tier2Classification

  // Speaker context
  speaker: SpeakerIdentity                    // Full identity (name, role, team/external)

  // Topic context
  topicSummary: string                        // Current topic summary

  // Conversation context
  recentUtterances: Utterance[]               // From ring buffer (~2 min)

  // Historical context (from Tier 3 matches)
  matchedHistoricalItems: {
    item: string                              // The historical decision/commitment/policy
    meetingDate?: string                      // When it was from
    status?: string                           // Current status
    similarity: number                        // How similar the match was
  }[]

  // Intra-meeting context (from Tier 3 commitment ledger search)
  matchedCommitments: {
    commitment: Commitment                    // The matched commitment from this meeting
    speaker: SpeakerIdentity                  // Who made it
    similarity: number
  }[]

  // Known constraints relevant to current topic
  relevantConstraints: Constraint[]
}
```

**Tier 4 reasons about:**
- Contradictions (self-contradiction, team inconsistency, client backtracking)
- Risks (risky commitments, scope creep, information leaks)
- Conflicts with organizational memory (past decisions, policies)
- Tone and behavioral patterns

**Output (Zod-enforced):**

```ts
interface Tier4Response {
  alertType: AlertCategory | "none"
  severity: "low" | "medium" | "high" | "critical"
  message: string                              // Headline / what to notice (overlay)
  surfaceReason?: string                       // One short user-visible “why flagged” line when surfacing
  suggestion?: string                         // One or two sentences: what to say or do next (when surfacing)
  confidence: number
  shouldSurface: boolean
  reasoning: string                            // Internal audit only — omit from traces/UI

  routing: "shared" | "personal" | "both"
  targetUserId?: string
}
```

If `shouldSurface = false` or `alertType = "none"`, nothing happens. When **`shouldSurface` is true**, validation requires user-facing copy: **`message`**, **`surfaceReason`**, and **`suggestion`** (alerts and pipeline traces expose the same surfaced fields; internal **`reasoning`** stays server-side only).

**Cost:** ~$0.02 per call × ~8 calls per meeting = **~$0.16 per meeting for Tier 4**

#### Total Cost Per 1-Hour Meeting

```
Deepgram STT (1 channel):    60 min × ~$0.0077/min        = ~$0.46
Dual-channel STT delta:      +60 channel-min × ~$0.0077   = +~$0.46
Pre-filter kills:            ~48 of 120 utterances (40%)
Tier 1 (structural):         ~72 utterances × $0          = FREE
Tier 2 (Groq Tier 2):        ~72 utterances × $0.002      = ~$0.14
Tier 3 (embeddings):         ~72 utterances × $0.00002    = ~$0.002
Tier 4 (large LLM):          ~8 utterances × $0.02        = ~$0.16

TOTAL (single-channel fallback): ~$0.76 per meeting
TOTAL (dual-channel default):    ~$1.22 per meeting
```

#### 5.6.1 Pipeline Orchestration — Parallel Tier Execution

Tiers 1, 2, 3 and **constraint extraction** read the same utterance and do not depend on each other's output. **`MeetingPipelineEngine`** runs them concurrently:

```ts
const constraintTask = constraintManager.processUtterance(utterance)

const [tier1, tier2, tier3, _constraints] = await Promise.all([
  runTier1Structural(utterance),       // <50ms,  free
  runTier2Classification(utterance),   // Groq + schema, ~$0.002
  runTier3EmbeddingSearch(utterance),    // novelty ∥ ledger ∥ memory (memory queries parallel)
  constraintTask,
])

applyTopicDelta(tier2.topicDelta)       // deterministic reducer update, same tick

const gate = decideTier4Gate({ tier1, tier2, tier3 })

if (gate.runTier4) {
  const tier4 = await runTier4DeepReasoning({
    utterance,
    tier2Classification: tier2,
    matchedHistoricalItems: tier3.memoryMatches,
    matchedCommitments:    tier3.ledgerMatches,
    relevantConstraints:   currentConstraints,
  })
  await dispatchAlert(tier4)
}
```

**Gate logic (runs in process after the parallel tier + constraint batch resolve):**

```
shouldStopForDeepReasoning =
  tier2.intent ∈ {filler, general}
  ∧ tier2.riskSignals.length === 0
  ∧ tier2.confidence > 0.8

highSignal =
  tier1.blocklistHit ∨ tier1.technicalHit ∨
  tier2.intent ∈ {commitment, decision, concern} ∨
  tier2.riskSignals.length > 0

forceTier4 =
  tier3.memoryMatches.length > 0 ∨ tier3.ledgerMatches.length > 0

runTier4 = ¬shouldStopForDeepReasoning ∧ (highSignal ∨ forceTier4)
```

**Latency envelope (after pre-filter):**

```
Pre-filter              <10ms
Tier 1 ∥ Tier 2 ∥ Tier 3 ∥ constraints ≈ max(50, 200, 100, …) = ~200ms tier-side (Tier 3 memory DB round-trips run in parallel)
Gate decision           <5ms
Tier 4 (when needed)    bounded by GEMINI_TIER4_TIMEOUT_MS (default 1500ms; fail-silent on timeout)
-----------------------------------
Without Tier 4:         <220ms
With Tier 4:            <720ms
```

This fits the <800ms end-to-end budget from speech-final to alert delivery (Deepgram final ~150ms + pipeline 220-720ms).

**Side-effects during parallel execution:**
- Tier 2, on `intent ∈ {"commitment", "decision"}`, writes to the in-session commitment index (§5.4.2) **after** its own promise resolves but **before** `Promise.all` returns — the write is awaited inside the Tier 2 task. Tier 3's ledger search therefore sees prior commitments but not the current one (correct: you don't want to match an utterance against itself).
- **Constraint extraction** runs inside the same `Promise.all`; constraint ledger inserts share the **debounced** Redis snapshot behavior as commitments.
- Tier 1 blocklist/technical hits are dispatched as "instant" alerts without waiting for Tier 4. These go out on the shared channel immediately.
- Topic summary LLM refinement is explicitly off the hot path. It triggers only on topic shift/topic close/significant delta and never blocks the parallel tiers → gate → Tier 4 flow.

#### 5.6.2 Pipeline traces (`meeting.pipeline.{sessionId}`)

For manual QA and dev observability, meeting-mode publishes a **versioned JSON** trace per utterance after evaluation to Redis pub/sub **`meeting.pipeline.{sessionId}`** (see `pipelineTraceChannel` in `packages/meeting-mode/src/channels.ts`).

- **Safe payload:** No embeddings vectors, no Tier 4 internal `reasoning` field — those stay out of the trace by design.
- **Gate visibility:** Includes Tier 2 “stop deep reasoning”, `forceTier4` from Tier 3, **`runTier4`**, and a **`highSignal`** summary flag for logs.
- **Tier 4 when surfaced:** The trace may include **`message`**, **`surfaceReason`**, and **`suggestion`** (user-visible copy that also ships on alerts).
- **`PIPELINE_TRACE_PRETTY_JSON`:** When truthy (default non-production), traces and matching realtime subscriber logs use indented JSON for readability.

Prometheus/session rollups in B.11 remain roadmap; **this channel is the current MVP for structured tier visibility.**

**Prometheus (meeting-mode):** tier duration histograms, **`pipeline_context_payload_cache_hits_total` / `_misses_total`**, **`ledger_snapshot_flushes_total`**, finalizer embed/publish-wait histograms (see `packages/meeting-mode/src/pipeline/metrics.ts`).

#### Three Model Tiers

| Model | Purpose | Cost per call | Example |
|-------|---------|---------------|---------|
| **Embedding model** | Search, similarity, novelty | ~$0.00002 | Gemini embed (`@google/genai`) |
| **Small LLM** | Classification, extraction | ~$0.002 | Groq chat completions + JSON schema (`GROQ_TIER2_MODEL`) |
| **Large LLM** | Deep reasoning, contradiction analysis | ~$0.02 | Gemini Tier 4 (`GEMINI_TIER4_MODEL`) |

**Embedding reuse rule (no duplicate work):**
- Generate one utterance embedding and reuse it for Tier 3 checks, Tier 2 semantic-cache similarity, topic centroid assignment, and commitment-ledger writes.
- Do not issue a second embedding call for topic assignment if Tier 3 already computed the utterance embedding.

---

### 5.7 Speaker-Aware Processing

With multi-user, speaker-aware processing is more nuanced than the old binary `YOU`/`THEM`:

```ts
function processingStrategy(speaker: SpeakerIdentity, viewerUserId: string) {
  if (speaker.isCurrentUser) {
    // This is ME speaking (the person viewing this Larity instance)
    // Run all tiers in parallel (not sequential)
    // Lower confidence threshold for surfacing (0.7 vs 0.85)
    // Priority queue position for LLM calls
    // Self-contradiction alerts are PERSONAL (only I see them)
    // Risky statement alerts are PERSONAL
    // Tone warnings are PERSONAL
  }

  if (speaker.type === "TEAM" && !speaker.isCurrentUser) {
    // This is a TEAM MEMBER speaking (not me)
    // Standard tier processing
    // Team inconsistency checks against MY commitments
    // Their risky statements → SHARED alert (all team members see)
    // Their self-contradictions → SHARED alert
  }

  if (speaker.type === "EXTERNAL") {
    // This is a CLIENT/EXTERNAL speaker
    // Sequential tier processing is fine
    // Higher confidence threshold (0.85)
    // Scope creep, backtracking, pressure tactics → SHARED alert
    // You have time — they're still talking
  }
}
```

---

### 5.8 Speaker State Tracker (Tone Trajectory)

Each speaker has a **rolling state tracker** that monitors tone and engagement over time:

```ts
interface SpeakerState {
  speakerId: string
  speaker: SpeakerIdentity

  // Rolling tone scores (updated by Tier 2 classifications)
  toneHistory: {
    tone: Tier2Classification["tone"]
    timestamp: number
  }[]

  // Engagement metrics
  avgResponseLength: number        // Rolling average word count
  responseFrequency: number        // Utterances per minute
  lastSpoke: number                // Timestamp

  // Computed signals
  toneTrajectory: "stable" | "escalating" | "de-escalating"
  engagementLevel: "active" | "passive" | "disengaged"
}
```

**Gradual tone shift detection:**
- Track rolling tone scores per speaker
- Alert when delta exceeds threshold over a time window
- Example: Speaker starts meeting at "neutral", shifts to "defensive" over 15 minutes — this gradual shift triggers a shared alert even though no single utterance was alarming

**Client disengagement detection:**
- Track response length ratio between TEAM and EXTERNAL speakers
- Flag when client gives only brief responses (1-3 words) after long team explanations
- This is a signal that the client is losing interest, disagreeing silently, or feeling overwhelmed

---

### 5.9 Live LLM Invocation (Non-Streaming, Atomic Alerts)

When Tier 4 LLM validation is needed:

#### Pattern — "Checking…" indicator, then one atomic alert

```
T+0ms:    Utterance finalized, Tier 4 LLM call initiated in parallel with Tiers 1-3 gate resolution
T+~80ms:  Tiers 1-3 resolved, gate decides Tier 4 is needed → subtle "Checking…" indicator
          shown only in the viewer's own feed, never as a toast or shared alert
T+~500ms: Tier 4 returns complete structured response
T+~520ms: Validate + dedupe + route → emit a single final alert (shared or personal)
          The "Checking…" indicator is replaced atomically with the alert, or cleared if
          Tier 4 returned { alertType: "none" | shouldSurface: false }
```

**Why not progressive/streaming alerts:**

Earlier designs showed a "preliminary alert" at ~T+300ms and a "final alert" at ~T+400ms. In practice this creates two UX problems:
1. Users see an alert appear, read it, adjust tone/words, and then the alert mutates or disappears when the final version arrives. The first version is therefore acted on but not reliable — a cognitive trap during a live conversation.
2. Alerts that downgrade or disappear after a preliminary flash erode trust in the system faster than occasional misses.

The rule is: **one atomic alert per Tier 4 invocation, or none.** Use the "Checking…" indicator to signal that the system is thinking; the indicator has no content so users cannot act on it prematurely. Streaming is still used *inside* the Tier 4 LLM call to reduce TTFB, but the UI only reacts once the full structured response is validated.

---

## 6. Live Alert System (Complete Implementation)

This section defines all alert categories, their detection mechanisms, and routing rules.

---

### 6.0 Alert System Architecture

```ts
interface Alert {
  id: string
  category: AlertCategory
  severity: "low" | "medium" | "high" | "critical"
  triggerUtteranceId: string
  speaker: SpeakerIdentity                   // Who triggered it
  topicId: string
  timestamp: number

  // Display
  title: string                    // Short headline: "Team inconsistency detected"
  message: string                  // Actionable message
  suggestion?: string              // Optional alternative phrasing or action

  // Routing
  routing: "shared" | "personal"
  targetUserId?: string            // For personal alerts — which user sees this

  // State
  status: "pending" | "shown" | "dismissed" | "expired"
  shownAt?: number
  expiresAt?: number

  // For debugging/logging
  triggerTier: 1 | 2 | 3 | 4
  confidence: number
  reasoning?: string
}

type AlertCategory =
  | "self_contradiction"           // Speaker contradicts their own earlier statement
  | "team_inconsistency"           // Two TEAM members contradict each other
  | "risky_commitment"             // Speaker makes a risky/unconditional commitment
  | "scope_creep"                  // EXTERNAL speaker tries to expand scope
  | "client_backtrack"             // EXTERNAL speaker changes previously agreed terms
  | "missing_clarity"              // Topic ends without clear ownership/deadline/actions
  | "information_risk"             // Sensitive/confidential information mentioned
  | "tone_warning"                 // Speaker's tone is counterproductive
  | "pressure_detected"            // EXTERNAL speaker uses pressure tactics
  | "policy_violation"             // Policy/compliance violation detected
  | "client_disengagement"         // Client giving only brief responses
  | "undiscussed_agenda"           // Agenda items never discussed (meeting end only)
```

#### Alert Queue Manager

```ts
interface AlertQueueManager {
  activeAlerts: Alert[]            // Currently displayed (max 2)
  pendingQueue: Alert[]            // Waiting to be shown
  recentlyShown: Alert[]           // For deduplication (last 60 seconds)

  // Configuration
  maxVisible: 2
  defaultExpiry: 15000             // 15 seconds
  highPriorityExpiry: 30000        // 30 seconds for critical
  debounceWindow: 5000             // Don't repeat similar alerts within 5s
}

// Priority order for queue processing
const ALERT_PRIORITY: Record<AlertCategory, number> = {
  policy_violation: 1,             // Highest - legal/compliance risk
  information_risk: 2,             // Data leak prevention
  self_contradiction: 3,           // You need to know immediately
  team_inconsistency: 4,           // Team is contradicting itself in front of client
  client_backtrack: 5,             // They changed terms
  pressure_detected: 6,            // You're being pressured
  risky_commitment: 7,             // Risk awareness
  scope_creep: 8,                  // Scope management
  tone_warning: 9,                 // Self-awareness
  client_disengagement: 10,        // Engagement concern
  missing_clarity: 11,             // Can catch at topic end
  undiscussed_agenda: 12           // Lowest - meeting end only
}
```

---

### 6.1 Category: Self-Contradiction Alerts

**Purpose:** Alert when a speaker contradicts their own earlier statement in the same meeting.

**Detection flow:**
```
Utterance classified as commitment/decision by Tier 2
  → Tier 2 writes commitment to ledger (with embedding)
  → Tier 3 searches commitment ledger for same speaker's prior commitments
  → If similar commitment found with conflicting data → force Tier 4
  → Tier 4 LLM evaluates if genuine contradiction exists
  → If confirmed → generate alert
```

**Routing:**
- If speaker `isCurrentUser` → **personal alert** (only the person who contradicted themselves sees it)
- If speaker is another TEAM member → **shared alert** (all team members see it — they need to know their colleague contradicted themselves)
- If speaker is EXTERNAL → classified as `client_backtrack` instead (see 6.3)

**Example alerts:**

| Scenario | Alert Message | Suggestion |
|----------|---------------|------------|
| Timeline shorter | "You mentioned 4 days earlier for this deliverable" | "Consider: 'We're revising the estimate to 2 days based on...'" |
| Timeline longer | "You committed to Friday, now suggesting next week" | "Consider acknowledging the change: 'Given X, we need to adjust to...'" |
| Scope expanded | "This adds frontend work to your earlier API-only commitment" | "Consider: 'To clarify, we're now including frontend as well'" |

---

### 6.2 Category: Team Inconsistency Alerts (NEW)

**Purpose:** Alert when two TEAM members contradict each other in front of the client. This is a new category that only exists in multi-user mode.

**Example scenario:** Rahul (TEAM) says "We can deliver in 2 weeks." 40 minutes later, Raj (TEAM) says "This will take about 2 months." The client now sees the team can't agree — this is damaging.

**Detection flow:**
```
TEAM member utterance classified as commitment/decision by Tier 2
  → Tier 3 searches commitment ledger for OTHER TEAM members' commitments (same type/topic)
  → If conflicting commitment found from a different TEAM member → force Tier 4
  → Tier 4 evaluates with full context (both speakers, both statements, topic)
  → If confirmed → generate team_inconsistency alert
```

**Routing:** Always **shared** — ALL team members need to see this immediately so they can align.

**Example alerts:**

| Scenario | Alert Message | Suggestion |
|----------|---------------|------------|
| Timeline conflict | "Raj said '2 months' but Rahul committed to '2 weeks' earlier" | "Team should align on timeline before client notices" |
| Scope conflict | "Priya excluded mobile from scope, but Amit just offered mobile support" | "Clarify scope internally" |
| Price conflict | "Different price points quoted: $50k (Rahul) vs $75k (Priya)" | "Align on pricing immediately" |

---

### 6.3 Category: Client Backtracking Alerts

**Purpose:** Alert when an EXTERNAL speaker changes previously agreed terms.

**Detection flow:**
```
EXTERNAL utterance classified as commitment/decision by Tier 2
  → Tier 3 searches commitment ledger for prior EXTERNAL commitments on same topic
  → If conflicting commitment found → force Tier 4
  → Tier 4 evaluates if genuine backtrack
```

**Routing:** **Shared** — all team members see this.

**Example alerts:**

| Their Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "Actually, we need it by Wednesday, not Friday" | "They're changing previously agreed timeline" | "Note the change and confirm impact" |
| "I know we said $50k but the budget is now $40k" | "Budget reduced from their original commitment" | "Discuss scope adjustment for new budget" |

---

### 6.4 Category: Risky Commitment Alerts

**Purpose:** Alert when a speaker makes a commitment that could backfire or weaken the team's position.

**Detection:** Entirely via Tier 2 classification. The small LLM identifies risk signals like:
- Unconditional commitments ("definitely", "guaranteed", "no problem")
- Underestimation language ("easy", "simple", "quick change")
- Open-ended promises ("whatever you need", "we'll handle everything")
- Authority overreach ("I'll approve the budget")
- Price/discount promises without verification

**No regex pattern libraries.** The LLM understands these semantically in any language.

**Routing:**
- If speaker `isCurrentUser` → **personal alert**
- If speaker is another TEAM member → **shared alert**

**Example alerts:**

| Risky Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "No problem, we'll definitely have it by Monday" | "Unconditional commitment detected" | "Consider: 'We're targeting Monday, barring any blockers'" |
| "This is a simple change, shouldn't take long" | "Underestimation language may set wrong expectations" | "Consider: 'Let me confirm the scope before estimating'" |
| "We'll handle whatever comes up" | "Open-ended promise without boundaries" | "Consider: 'We'll handle issues within the agreed scope'" |

---

### 6.5 Category: Scope Creep Alerts

**Purpose:** Alert when EXTERNAL speakers attempt to expand scope beyond what was agreed.

**Detection:** Tier 2 classifies the intent and risk signals. The LLM catches phrases like "can you also", "while you're at it", "I assumed it was included" — in any language.

**Routing:** **Shared** — all team members see this.

**Example alerts:**

| Their Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "Can you also add the mobile version?" | "New scope item not in original agreement" | "Consider: 'Mobile wasn't in our original scope—let's discuss separately'" |
| "I assumed the training was included" | "They're assuming scope not previously agreed" | "Clarify what was/wasn't included" |

---

### 6.6 Category: Missing Clarity Alerts

**Purpose:** Alert when important details are left ambiguous or undefined when a topic concludes.

**Trigger:** On topic shift, evaluate the **outgoing topic** for completeness.

```ts
interface TopicCompletenessCheck {
  topicId: string
  topicLabel: string

  checks: {
    ownerMissing: boolean          // No one assigned
    ownerVague: boolean            // "Someone should..." "We need to..."
    deadlineMissing: boolean       // No date mentioned
    deadlineVague: boolean         // "Soon", "ASAP", "when possible"
    noActionItems: boolean         // Topic discussed, nothing to do?
    actionItemsVague: boolean      // "Look into it", "Think about it"
    noMutualConfirmation: boolean  // One-sided agreement only
    vagueConfirmation: boolean     // "Sounds good", "I guess", "Maybe"
  }
}
```

**Detection:** Tier 2's classification of each utterance feeds into topic completeness tracking. The LLM-based classification catches vague language in any language, replacing the old regex patterns for vague ownership, vague timeline, vague confirmation, and vague action items.

**Routing:** **Shared** — all team members should know about incomplete topics.

**Example alerts:**

| Situation | Alert Message | Suggestion |
|-----------|---------------|------------|
| Topic ends without owner | "No owner assigned for: API integration" | "Consider asking: 'Who will own this?'" |
| Vague timeline | "Timeline unclear for: Payment feature" | "Consider: 'Can we set a target date?'" |
| No action items | "No next steps defined for: Security review" | "Consider: 'What are our action items?'" |
| Vague confirmation | "Confirmation was vague on: Pricing" | "Consider getting explicit agreement" |

---

### 6.7 Category: Information Risk Alerts

**Purpose:** Alert when sensitive or confidential information may be leaked.

**Preloaded context required:**

```ts
interface InformationRiskContext {
  protectedClientNames: string[]   // Names that shouldn't be mentioned
  financialTerms: string[]         // ["margin", "cost basis", "internal rate"]
  technicalSecrets: string[]       // ["API key", "password", "secret"]
  unreleasedFeatures: string[]     // Features not yet public
  strategyTerms: string[]          // ["acquisition", "pivot", "layoff"]
}
```

**Detection:** Two-layer approach:
1. **Tier 1** catches structural patterns (API keys, long hashes, SSH keys, client name exact matches from blocklist)
2. **Tier 2** catches semantic information risks (financial disclosure, roadmap leaks, strategy leaks, third-party confidential info) — via LLM classification, works in any language

**Routing:**
- Information risk → **BOTH shared + personal**
- Team sees the warning (shared alert)
- The specific speaker gets additional context in their personal alert ("you mentioned X — check if this is shareable")

**Example alerts:**

| Statement | Alert Message | Suggestion |
|-----------|---------------|------------|
| "We did something similar for Acme Corp" | "Client name 'Acme Corp' mentioned—check NDA" | "Consider: 'We've done similar work for other clients'" |
| "Our margin on this is about 40%" | "Internal financial data disclosed" | "Avoid sharing internal margins" |
| "Here's the API key: sk-abc123..." | "Technical credential detected!" | "Never share credentials verbally" |

---

### 6.8 Category: Tone Warning Alerts

**Purpose:** Alert when a speaker's tone may be counterproductive.

**Detection:** Entirely via Tier 2 classification. The `tone` field in Tier 2's output identifies defensive, aggressive, hesitant tones. No regex pattern libraries — the LLM understands tone semantically in any language.

**Additionally:** The Speaker State Tracker (Section 5.8) detects **gradual tone shifts** — when a speaker's tone trajectory escalates over time, even if no single utterance is alarming on its own.

**Routing:**
- If speaker `isCurrentUser` → **personal alert** ("Your tone is becoming defensive")
- If speaker is another TEAM member → **shared alert** (team should know)

**Example alerts:**

| Statement | Alert Message | Suggestion |
|-----------|---------------|------------|
| "That's not our fault, we delivered on time" | "Defensive tone detected" | "Consider: 'Let's look at the timeline together'" |
| "I'm so sorry, I'm really sorry about this..." | "Excessive apology may weaken position" | "One clear apology is sufficient" |
| "No, that's completely wrong!" | "Reactive response—take a breath" | "Consider: 'I see it differently—here's why...'" |
| (gradual escalation over 15 min) | "Your tone has shifted toward defensive over the last 15 minutes" | "Consider taking a different approach" |

---

### 6.9 Category: Pressure Detected Alerts

**Purpose:** Alert when EXTERNAL speakers use pressure tactics.

**Detection:** Tier 2 classification. The LLM identifies pressure tactics semantically — social proof ("everyone else does this"), artificial urgency ("we need an answer today"), authority pressure ("leadership expects"), guilt pressure ("after everything we've done"), implicit threats ("we'll have to reconsider"). Works in any language.

**Routing:** **Shared** — all team members see this.

**Example alerts:**

| Their Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "Everyone else in the industry does this" | "Social proof pressure tactic detected" | "Their comparison may not apply to your situation" |
| "We need your answer by end of day" | "Artificial urgency—take time to decide" | "Consider: 'I'll give you a considered response by X'" |
| "After everything we've done for you..." | "Guilt pressure tactic detected" | "Focus on the current terms, not obligations" |

---

### 6.10 Category: Client Disengagement Alerts

**Purpose:** Alert when the client appears to be disengaging from the conversation.

**Detection:** The Speaker State Tracker monitors:
- Response length ratio between TEAM and EXTERNAL speakers
- When client gives only brief responses (1-3 words) after long team explanations
- When client's response frequency drops significantly
- When client's engagement level shifts from "active" to "passive" or "disengaged"

**Routing:** **Shared** — all team members should notice this.

**Example alerts:**

| Situation | Alert Message | Suggestion |
|-----------|---------------|------------|
| Client giving 1-word answers for 5+ minutes | "Client engagement dropping — brief responses for the last 5 minutes" | "Consider checking in: 'Does this approach make sense to you?'" |
| Client response frequency dropped 70% | "Client has become significantly less vocal" | "Consider pausing for questions" |

---

### 6.11 Category: Undiscussed Agenda Items (Meeting End Only)

**Purpose:** Alert at meeting end if agenda items were never discussed.

**Detection:** At meeting end, compare the set of discussed topics against the pre-loaded agenda from calendar data. Any agenda items with no matching topic → alert.

**Routing:** **Shared** — all team members see what was missed.

**Timing:** Only fires during the meeting exit sequence, not during the meeting itself.

**Example alert:**

| Situation | Alert Message |
|-----------|---------------|
| "Security review" was on the agenda but never discussed | "Agenda item never discussed: Security review" |
| "Budget approval" was on the agenda but never discussed | "Agenda item never discussed: Budget approval" |

---

## 7. Alert Routing — Shared vs Personal Channels

### 7.1 Two Channel Types

With multi-user sessions, alerts are routed to **two types of Redis channels per session:**

```
meeting.alert.{sessionId}.shared          → ALL team members see these
meeting.alert.{sessionId}.user.{userId}   → Only that specific user sees these
```

Each team member's Larity instance subscribes to both:
1. The shared channel
2. Their personal channel

### 7.2 Routing Rules by Category

| Alert Category | Routing | Reasoning |
|----------------|---------|-----------|
| `self_contradiction` (own) | **Personal** | Only you need to know you contradicted yourself |
| `self_contradiction` (team member) | **Shared** | Team needs to know |
| `team_inconsistency` | **Shared** | Everyone must align |
| `risky_commitment` (own) | **Personal** | Personal coaching |
| `risky_commitment` (team member) | **Shared** | Team awareness |
| `scope_creep` | **Shared** | Team decision needed |
| `client_backtrack` | **Shared** | Team awareness |
| `missing_clarity` | **Shared** | Team should close gaps |
| `information_risk` | **Both** | Team sees warning + speaker gets personal context |
| `tone_warning` (own) | **Personal** | Private self-awareness |
| `tone_warning` (team member) | **Shared** | Team should know |
| `pressure_detected` | **Shared** | Team awareness |
| `policy_violation` | **Both** | Team sees + speaker gets personal warning |
| `client_disengagement` | **Shared** | Team should adjust |
| `undiscussed_agenda` | **Shared** | Team should know |

### 7.3 Alert Rendering & UX Rules

#### Display Rules

```ts
const ALERT_UX_RULES = {
  // Visibility
  maxVisibleAlerts: 2,
  alertPosition: "top-right overlay",
  alertWidth: "320px max",

  // Timing
  fadeInDuration: 200,             // ms
  displayDuration: {
    low: 10000,                    // 10 seconds
    medium: 15000,                 // 15 seconds
    high: 20000,                   // 20 seconds
    critical: 30000                // 30 seconds, requires dismiss
  },
  fadeOutDuration: 300,            // ms

  // Interaction
  dismissOnClick: true,
  dismissOnSwipe: true,
  hoverPausesFade: true,

  // Stacking behavior
  newAlertPosition: "top",         // New alerts appear on top
  queueOverflowBehavior: "drop_lowest_priority",

  // Sound/haptics
  soundEnabled: false,             // By default, silent
  hapticFeedback: {
    critical: true,                // Vibrate for critical only
    high: false,
    medium: false,
    low: false
  }
}
```

#### Alert Visual Hierarchy

```
┌─────────────────────────────────────┐
│ CRITICAL: Technical credential       │ ← Red border, bold
│ API key detected in speech          │
│ [SHARED]                [Dismiss]   │
├─────────────────────────────────────┤
│ Team inconsistency                   │ ← Orange border
│ Raj said 2 months, Rahul said 2wks │
│ [SHARED]                [Dismiss]   │
└─────────────────────────────────────┘
```

Personal alerts are visually distinguished from shared alerts (different badge/indicator) so users know whether the alert is visible to the whole team or just them.

#### Deduplication & Debouncing

```ts
function shouldShowAlert(newAlert: Alert): boolean {
  // Check recent alerts for duplicates
  const isDuplicate = recentlyShown.some(shown =>
    shown.category === newAlert.category &&
    shown.topicId === newAlert.topicId &&
    (Date.now() - shown.timestamp) < DEBOUNCE_WINDOW
  )

  if (isDuplicate) {
    return false
  }

  // Check if similar alert is currently visible
  const isSimilarVisible = activeAlerts.some(active =>
    active.category === newAlert.category &&
    active.status === "shown"
  )

  if (isSimilarVisible) {
    // Update existing instead of showing new
    updateExistingAlert(activeAlerts.find(...), newAlert)
    return false
  }

  return true
}
```

---

### 7.4 Silent Collaborator Mode (Default Behavior)

All alerts follow **Silent Collaborator** principles:

* No proactive speaking or chatty responses
* Only surfaces high-signal events
* Alerts are suggestions, never commands
* User maintains full control

**Category Filtering by Confidence Threshold:**

```ts
const SILENT_COLLABORATOR_THRESHOLDS: Record<AlertCategory, number> = {
  policy_violation: 0.6,           // Lower threshold - always show
  information_risk: 0.7,
  self_contradiction: 0.75,
  team_inconsistency: 0.75,
  client_backtrack: 0.75,
  pressure_detected: 0.7,
  risky_commitment: 0.8,
  scope_creep: 0.8,
  tone_warning: 0.85,              // Higher threshold - only clear cases
  client_disengagement: 0.85,
  missing_clarity: 0.85,
  undiscussed_agenda: 0.7
}
```

Only alerts exceeding their category's confidence threshold are surfaced.

---

## 8. Ambient Awareness Layer

Non-intrusive signals that prove the system is alive, visible to **all connected team members**:

#### Topic Indicator
* Shows current detected topic label
* Updates on topic shift with brief animation
* Example: "Delivery timeline" → "Pricing discussion"

#### Constraint Counter
* Shows: "4 constraints tracked"
* Increments when new constraint detected (from meeting or preloaded)
* Subtle pulse animation on increment

#### Listening Heartbeat
* Subtle visual confirmation audio is being processed
* Could be: waveform, pulse dot, or processing indicator
* Disappears if audio stream drops (indicates problem)

#### Participant Indicator
* Shows who is connected to the session
* Shows speaker identification status (identified / pending)
* Updates when participants join/leave

**These are NOT alerts.** They're ambient proof of awareness.

---

## 9. Exiting Meeting Mode

### Exit Triggers

* Host clicks "End Meeting"
* Host's detected meeting app closes, or the captured audio sink goes silent for the configured grace period (the desktop app notifies the server)
* Inactivity timeout (no utterances emitted for the configured window, default 5 min)
* All participants disconnect

### Pre-Exit: Undiscussed Agenda Check

Before finalizing, the system compares discussed topics against pre-loaded agenda items. Any undiscussed items generate `undiscussed_agenda` alerts (shared).

### Finalization Sequence

1. Live pipelines stop
2. Short-term buffers frozen
3. Topic states serialized for post-processing
4. Constraint ledger handed off
5. **Commitment ledger handed off** — all commitments with their statuses, embeddings, and relationships
6. Speaker identity mappings persisted
7. Raw audio persisted (if enabled)
8. Async jobs queued:
   * Batch STT refinement (Whisper)
   * Speaker diarization refinement
   * Transcript chunking
   * Decision/task extraction
   * **Commitment ledger → PostgreSQL + pgvector** (becomes organizational memory)
   * **Final meeting summary generation**

**Live state is destroyed. Canonical memory begins.**

---

## 10. State Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MEETING SESSION (Remote Server)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Session State                                                              │
│  ├── Session ID, Meeting ID, Org ID, Client ID                             │
│  ├── Host user (audio source)                                              │
│  ├── Connected participants (SessionParticipant[])                         │
│  └── Session status (initializing → active → ending → ended)              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Speaker Identification (VAD-correlation based — no voice models)           │
│  ├── Team roster for session (userId → name, from DB)                      │
│  ├── VAD state per team member (isSpeaking, startTs — rolling ~2s window)  │
│  ├── Diarization index → SpeakerIdentity mapping (cached, persisted Redis) │
│  ├── Speaker state trackers (tone trajectory, engagement per speaker)      │
│  └── Pending buffer for utterances awaiting late VAD correlation (~2s)     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Preloaded Context (read-only)                                              │
│  ├── Org constraints                                                        │
│  ├── Policy guardrails                                                      │
│  ├── Open decisions (client-scoped)                                        │
│  ├── Predicted topic constraints (pre-embedded)                             │
│  ├── Client name list (for info leak detection)                             │
│  ├── Org-configured keyword blocklists                                     │
│  ├── Prior commitments (from previous meetings)                            │
│  └── Calendar agenda items                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Three Memory Layers (mutable during meeting)                               │
│  ├── Ring Buffer (in-memory, ~2 min)                                       │
│  │   └── Recent raw utterances with speaker identity                       │
│  ├── Commitment Ledger (Redis, entire meeting)                             │
│  │   └── Commitment[] with embeddings                                      │
│  │       ├── TEAM commitments (per user, for self-contradiction + team     │
│  │       │   inconsistency detection)                                      │
│  │       └── EXTERNAL commitments (for backtrack detection)                │
│  └── pgvector (PostgreSQL, historical)                                     │
│      └── Past decisions, commitments, policies (searched at Tier 3)        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Other Live State                                                           │
│  ├── Topic State Map                                                        │
│  │   └── TopicState[] with completeness tracking                           │
│  ├── Constraint Ledger                                                      │
│  │   └── Constraint[] (preloaded + meeting-discovered)                     │
│  ├── Speculative Cache                                                      │
│  │   └── Pre-computed results for partial utterances                       │
│  └── Alert State Manager                                                    │
│      ├── Active alerts per channel (max 2 visible per user)                │
│      ├── Pending queue (priority-ordered)                                  │
│      └── Recently shown (for deduplication)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Processing Pipeline                                                        │
│  ├── Pre-filter (noise removal, ~40% killed)                               │
│  ├── Tier 1: Structural detection (free, <50ms)                            │
│  ├── Tier 2: Small LLM classification (~$0.002/call, <200ms)              │
│  ├── Tier 3: Embedding search + novelty (~$0.00002/call, <100ms)          │
│  └── Tier 4: Large LLM reasoning (~$0.02/call, 300-500ms)                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Alert Routing                                                              │
│  ├── Shared channel: meeting.alert.{sessionId}.shared                      │
│  │   → All team members                                                    │
│  └── Personal channels: meeting.alert.{sessionId}.user.{userId}           │
│      → Individual team members only                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Alert Categories (12 types)                                                │
│  ├── self_contradiction          ├── client_backtrack                      │
│  ├── team_inconsistency (NEW)    ├── missing_clarity                      │
│  ├── risky_commitment            ├── information_risk                      │
│  ├── scope_creep                 ├── tone_warning                         │
│  ├── pressure_detected           ├── client_disengagement (NEW)           │
│  ├── policy_violation            └── undiscussed_agenda (NEW)             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Ambient UI State (per connected user)                                     │
│  ├── Current topic label                                                   │
│  ├── Constraint count                                                      │
│  ├── Listening status                                                      │
│  ├── Participant list + identification status                              │
│  └── Alert overlay (0-2 alerts visible, shared + personal mixed)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Feature → Meeting Mode Mapping

| Feature | In Meeting Mode? | How | Latency |
|---------|------------------|-----|---------|
| **Self-contradiction detection** | Yes | Commitment Ledger + Tier 3 search + Tier 4 LLM | 300-500ms |
| **Team inconsistency detection** | Yes | Cross-speaker commitment comparison + Tier 4 LLM | 300-500ms |
| **Risky statement alerts** | Yes | Tier 2 LLM classification | <200ms (Tier 2) to 500ms (if Tier 4) |
| **Scope creep detection** | Yes | Tier 2 LLM classification + scope baseline | <200ms to 500ms |
| **Client backtrack detection** | Yes | EXTERNAL commitment tracking + Tier 3 + Tier 4 | 300-500ms |
| **Pressure tactic detection** | Yes | Tier 2 LLM classification | <200ms |
| **Missing clarity alerts** | Yes | Topic completeness check on shift | <200ms |
| **Information risk alerts** | Yes | Tier 1 structural + Tier 2 semantic | <50ms (Tier 1) to 200ms (Tier 2) |
| **Tone warning alerts** | Yes | Tier 2 classification + speaker state tracker | <200ms |
| **Client disengagement** | Yes | Speaker state tracker metrics | Real-time |
| **Undiscussed agenda items** | Yes (exit) | Topic-agenda comparison at meeting end | <100ms |
| **Policy violation alerts** | Yes | Tier 1 blocklist + Tier 2 LLM | <50ms to 200ms |
| Live response suggestions | Yes | Triggered, gated, streaming via Tier 4 | 300-500ms |
| Silent collaborator | Yes | Default behavior | — |
| Topic tracking | Yes | Ambient indicator | Real-time |
| Constraint tracking | Yes | Ambient counter | Real-time |
| Speaker identification | Yes | Host channel short-circuit + VAD-correlation diarization | 50-100ms |
| Decision logging | No | Post-meeting only | — |
| Versioned decisions | No | Post-meeting only | — |
| Knowledge graph | No | Post-meeting only | — |
| Memory updates | No | Forbidden live | — |

---

## 12. Development Approach

### Phase 1: Core Pipeline
1. Dual-source audio capture (host mic ch0 + system loopback ch1) → **tagged mono** WebSocket transport → **`createDualChannelSession`** with `diarize=true` on each mono stream
2. Utterance finalizer with channel index + speaker diarization indices
3. Basic ring buffer implementation
4. Session lifecycle (start/join/end)
5. Multi-user session management (host + participants)

### Phase 2: Speaker Identification
1. VAD integration in Tauri desktop app (local mic, per user; Rust-side VAD preferred once mic capture is already active)
2. VAD speaking signals sent via WebSocket to server
3. Server-side diarization index correlation (`SpeakerIdentifier`)
4. Identity cache per session + retroactive utterance reprocessing
5. EXTERNAL speaker handling (calendar data for names)

### Phase 3: State Management
1. Topic state with embedding-based clustering
2. Constraint ledger (preloaded + live)
3. Commitment ledger in Redis (with embeddings, per-speaker)
4. Topic assignment logic
5. Topic completeness tracking structure
6. Speaker state tracker (tone trajectory, engagement metrics)

### Phase 4: Tier 1 — Structural Detection
1. Pre-filter (noise removal — <3 words, acknowledgments, duplicates)
2. Date/time extraction (structural patterns)
3. Number extraction ($, %, quantities)
4. Org-configured keyword blocklist matching
5. Technical pattern detection (API keys, hashes, credentials)

### Phase 5: Tier 2 — Small LLM Classification
1. Gemini flash-lite integration via `@google/genai`
2. Zod schema for Tier 2 output
3. Intent classification (commitment, decision, question, concern, filler, general)
4. Tone classification (neutral, defensive, aggressive, hesitant, confident)
5. Risk signal extraction
6. Structured data extraction (deadline, quantity, scope, amount)
7. Cross-utterance context (last 2-3 from same speaker)
8. Gate logic (filler → stop, commitment → write to ledger)

### Phase 6: Tier 3 — Embedding Search
1. Embedding generation for utterances
2. Novelty check (intra-meeting deduplication)
3. pgvector search (historical memory — decisions, commitments, policies)
4. Commitment ledger search (intra-meeting contradiction detection)
5. Forcing logic (match found → force Tier 4)

### Phase 7: Tier 4 — Deep LLM Reasoning
1. Context assembly (ring buffer + Tier 3 matches + constraints)
2. Gemini Pro-class integration for deep reasoning
3. Zod schema for Tier 4 output
4. Alert generation with routing (shared/personal/both)
5. Streaming LLM call under atomic alert UX (no progressive/preliminary alerts)

### Phase 8: Alert System
1. Alert queue manager (priority, deduplication, expiry)
2. Shared channel (Redis pub/sub: `meeting.alert.{sessionId}.shared`)
3. Personal channels (Redis pub/sub: `meeting.alert.{sessionId}.user.{userId}`)
4. Alert UI components (overlay, dismiss, stack behavior)
5. All 12 alert categories wired through pipeline
6. Team inconsistency detection (cross-speaker TEAM comparison)
7. Client disengagement detection (speaker state tracker → alert)
8. Undiscussed agenda item detection (meeting end → topic-agenda comparison)

### Phase 9: Ambient UI
1. Topic indicator component
2. Constraint counter component
3. Listening heartbeat
4. Participant list + identification status
5. Alert surfacing with shared/personal visual distinction

### Phase 10: Optimizations
1. Speculative processing on partial utterances
2. Speaker-aware priority queuing
3. Streaming LLM responses
4. Predictive constraint loading
5. Confidence threshold tuning per alert category

### Phase 11: Integration & Polish
1. End-to-end testing of all 12 alert categories
2. Performance optimization (meet latency budgets)
3. Multi-user session stress testing
4. Voice identification accuracy testing across languages
5. Edge case handling
6. User testing and refinement

---

## 13. Performance Budgets

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| Audio chunk → STT (Deepgram) | 50ms | 100ms |
| Pre-filter | 5ms | 10ms |
| Tier 1 structural checks | 20ms | 50ms |
| Tier 2 small LLM classification | 100ms | 200ms |
| Tier 3 embedding search (pgvector) | 50ms | 100ms |
| Tier 3 commitment ledger search | 30ms | 50ms |
| Tier 4 LLM call (streaming start) | 200ms | 400ms |
| Tier 4 LLM call (complete) | 400ms | 800ms |
| VAD edge detection | 10ms | 50ms |
| Speaker identity cache lookup | 1ms | 5ms |
| Topic assignment | 30ms | 50ms |
| Alert render | 16ms | 32ms |
| Topic completeness check | 20ms | 50ms |
| Alert routing (Redis pub/sub) | 5ms | 20ms |

If any operation exceeds max acceptable, it is **skipped**, not queued.

---

## 14. Failure Modes

| Failure | Behavior |
|---------|----------|
| STT drops connection | Listening heartbeat disappears, auto-reconnect |
| Host disconnects | Meeting tracking stops. No failover in v1 |
| Team member disconnects | They stop receiving alerts. Others unaffected |
| Voice identification fails | Speaker treated as EXTERNAL (conservative default), except channel 0 host utterances in dual-channel mode |
| One host capture stream fails | Fall back to single-source mode (tagged mono for surviving stream); reduce to one Deepgram connection if implemented; host ambient warning; meeting continues where possible |
| Tier 2 LLM times out | Skip classification, treat as general (no alert) |
| Tier 4 LLM times out | Skip this evaluation, log for debugging |
| LLM returns invalid schema | Discard, don't surface |
| Topic clustering fails | Assign to "General" topic, continue |
| Speculative work mismatch | Discard, process fresh (no user impact) |
| Commitment ledger write fails | Log, continue without tracking this commitment |
| Commitment ledger search fails | Skip intra-meeting contradiction check for this utterance |
| pgvector search fails | Skip historical memory check for this utterance |
| Redis pub/sub fails | Alerts not delivered. Log. Reconnect |
| Alert queue overflow | Drop lowest priority alerts |
| Calendar data unavailable | Skip agenda preload, skip undiscussed agenda check |
| Voiceprint not found for user | User's speech won't be identified as TEAM (will be EXTERNAL) |

**Principle:** Failure is silent and non-destructive. User never sees errors during meeting.

---

## 15. Core Philosophy

Meeting Mode is **not** where intelligence lives.
It is where **mistakes are prevented**.

* No deep reasoning (except targeted Tier 4 calls)
* No long-term writes
* No creativity
* No trust without evidence

**Alert Philosophy:**
* Self-awareness over self-righteousness — help users catch their own missteps
* Team cohesion over individual blame — team inconsistency alerts help alignment, not finger-pointing
* Protection over perfection — better to miss an edge case than cry wolf
* Suggestion over instruction — alerts inform, never command
* Context over rules — Tier 2 LLM understands context, not just patterns
* Language-agnostic by design — no English-only pattern libraries

**Multi-User Philosophy:**
* Shared awareness — the team sees what matters together
* Private coaching — personal missteps are personal alerts
* Host simplicity — one audio source, one pipeline, shared results
* Conservative identification — unidentified speakers default to EXTERNAL

If Meeting Mode feels quiet, that's correct.
If it feels noisy, it's broken.
If it feels dead, add ambient signals — not more alerts.

---

## One-Sentence Summary

**Meeting Mode is a conservative, stateful, multi-user, topic-aware real-time system running on a shared remote server that streams a dual-channel feed from a single host's native desktop app (host mic on ch0, OS-level system loopback on ch1; platform-agnostic — Zoom, Meet, Teams, or any conferencing tool), identifies the host by channel and other speakers by correlating Deepgram diarization indices with per-user local-mic VAD signals (no voice models, no enrollment), classifies utterances through a four-tier pipeline (structural → small LLM → embedding search → large LLM), tracks commitments across the entire meeting in a live ledger, detects self-contradictions and team inconsistencies and risky statements, warns about scope creep and pressure tactics and client backtracking, surfaces missing clarity and client disengagement, prevents information leaks, monitors tone trajectories, routes alerts to shared and personal channels across all connected team members, and never mutates organizational memory.**
