# LARITY — DEVELOPMENT TIMELINE

**Reference Documents:**
- [architecture-and-flow.md](./architecture-and-flow.md) — System architecture (multi-user, remote server)
- [meeting-mode.md](./meeting-mode.md) — Meeting mode specification (voice embeddings, tiered LLM pipeline, 12 alert categories)
- [features.md](./features.md) — Complete feature list

---

## Current State Assessment

### Completed

| Component | Status | Details |
|-----------|--------|---------|
| **packages/infra/redis** | Done | Client, pubsub, locks, TTL, keys, health checks |
| **packages/infra/rabbitmq** | Done | Connection, exchanges (ex.events, ex.jobs), queues (q.meeting.transcribe, q.meeting.summary), publish/consume with DLQ |
| **packages/infra/prisma** | Done | Full schema with all models (User, Meeting, MeetingParticipant, Transcript, etc.) |
| **apps/control** | Done | Elysia API with all routes, services, validators, auth middleware |
| **apps/realtime** | Done | uWebSockets.js server with session management, audio frame ingestion, Redis publishing |
| **packages/stt** | Done | Deepgram integration, session manager, Redis audio subscriber, utterance output |
| **packages/meeting-mode** (partial) | Done | Utterance finalizer, merger, ring buffer (basic + persistent), context assembler |

### What Needs Architectural Changes (Existing Code)

The existing codebase was built for a **single-user, local-server, binary speaker model**. The following changes are needed to align with the updated multi-user architecture:

#### 1. Speaker Model: `"YOU" | "THEM"` → `SpeakerIdentity`

The binary speaker model is hardcoded throughout. Every reference needs to change to the new `SpeakerIdentity` interface:

```ts
// OLD (current code)
type Speaker = "YOU" | "THEM"

// NEW (multi-user architecture)
interface SpeakerIdentity {
  speakerId: string
  type: "TEAM" | "EXTERNAL"
  userId?: string
  name: string
  diarizationIndex?: number
  isCurrentUser: boolean
  confidence: number
}
```

**Files requiring changes:**

| File | What needs to change |
|------|---------------------|
| `packages/stt/src/types.ts:16` | `Speaker = "YOU" \| "THEM"` → remove type, `SttResult.speaker` → `SttResult.diarizationIndex: number` |
| `packages/stt/src/deepgram/connection.ts:177` | `speaker: this.currentSource === "mic" ? "YOU" : "THEM"` → use Deepgram diarization index instead |
| `packages/stt/src/deepgram/types.ts` | `DEFAULT_DG_CONFIG` needs `diarize: true` added |
| `packages/stt/src/types.ts:11` | `AudioSource = "mic" \| "system"` — keep but no longer determines identity |
| `packages/meeting-mode/src/utterance/types.ts:1` | `Speaker = "YOU" \| "THEM"` → replace with `SpeakerIdentity` import |
| `packages/meeting-mode/src/utterance/types.ts:6` | `Utterance.speaker: Speaker` → `Utterance.speaker: SpeakerIdentity` |
| `packages/meeting-mode/src/utterance/ring-buffer.ts:118` | `getBySpeaker(speaker: "YOU" \| "THEM")` → filter by `type` or `speakerId` |
| `packages/meeting-mode/src/utterance/ring-buffer.ts:179` | Format string uses `u.speaker` → use `u.speaker.name` |
| `packages/meeting-mode/src/utterance/merger.ts:40` | `shouldMerge` checks `prev.speaker !== next.speaker` → compare `speakerId` |
| `packages/meeting-mode/src/utterance/finalizer.ts` | Creates `Utterance` with `speaker: result.speaker` → needs `SpeakerIdentity` from voice identification |
| `packages/meeting-mode/src/context/context-assembler.ts:15` | `speaker?: "YOU" \| "THEM"` → filter by `type` or `speakerId` |
| `packages/meeting-mode/src/context/context-assembler.ts:194-195` | `yourUtterances`/`theirUtterances` → `teamUtterances`/`externalUtterances` or per-speaker grouping |

#### 2. Deepgram Diarization

Current Deepgram config does NOT enable diarization. Changes needed:

| File | What needs to change |
|------|---------------------|
| `packages/stt/src/deepgram/types.ts` | Add `diarize: true` to `DEFAULT_DG_CONFIG` |
| `packages/stt/src/deepgram/types.ts` | `TranscriptResult` type needs to include speaker/diarization fields from Deepgram response |
| `packages/stt/src/deepgram/connection.ts` | Parse `channel.alternatives[0].words[].speaker` from diarized results |
| `packages/stt/src/deepgram/connection.ts` | Remove `currentSource → speaker` mapping logic |

#### 3. Multi-User Session Model

Current session model assumes one user per session. Changes needed:

| File | What needs to change |
|------|---------------------|
| `apps/realtime/src/session.ts` | `Map<string, SessionEntry>` needs to support multiple connections per meeting session (host + participants) |
| `apps/realtime/src/types.ts:40` | `AudioFramePayload.source` — only host sends audio; participants are receive-only |
| `apps/realtime/src/handlers/on-upgrade.ts` | Need to validate user identity and role (host vs participant), not just session existence |
| `apps/control/src/services/meeting-session.service.ts` | `SessionData` needs `hostUserId`, `participants[]`, `orgId`, `clientId` |
| `apps/control/src/services/meeting-session.service.ts` | Add `join()` method (currently only `start` and `end` exist) |
| `apps/control/src/validators/meeting-session.ts` | `startSessionSchema.metadata.audioSource` — simplify, host always sends tab audio |

#### 4. Prisma Schema Additions

New models needed:

| Model | Purpose |
|-------|---------|
| `Voiceprint` | Store team member voice embedding vectors (linked to User, one per user) |
| `Commitment` | Persist commitment ledger after meeting ends (linked to Meeting, speaker attribution) |

#### 5. Redis Key/Channel Additions

New keys needed for multi-user:

| Key Pattern | Purpose |
|-------------|---------|
| `meeting.session.{sessionId}.participants` | Track connected participants |
| `meeting.alert.{sessionId}.shared` | Shared alert channel (all team members) |
| `meeting.alert.{sessionId}.user.{userId}` | Personal alert channel (specific user) |
| `meeting.commitment.{sessionId}` | Commitment ledger (entire meeting) |
| `meeting.speaker.{sessionId}` | Speaker identification state (diarization index → identity) |

#### 6. Removed: Regex Pattern Libraries

The old timeline (Week 2, Day 12-13) planned for extensive regex pattern libraries:
- Risky language patterns
- Pressure tactic patterns
- Emotional indicator patterns
- Scope creep patterns
- Backtrack patterns
- Vague language patterns

**All of these are removed.** They are replaced by Tier 2 small LLM classification (GPT-4o-mini), which works in any language and catches semantic meaning that regex cannot.

Tier 1 is now **structural detection only** — dates, numbers, blocklist keywords, technical patterns (API keys, hashes). No English-specific regex.

---

## Realtime Server Details (Already Built)

The `apps/realtime` server is functional but needs multi-user updates:

```
Current Audio Flow:
Client → WebSocket (binary frames) → onMessage handler → Redis publish

Needs to become:
Host Client → WebSocket (binary frames) → onMessage handler → Redis publish
Team Clients → WebSocket (control only) → receive processed results

Current Session Flow:
Connect → onOpen → addSession → publish session.start
Disconnect → onClose → removeSession → publish session.end

Needs to become:
Host Connect → onOpen → addSession(role: host) → publish session.start
Host Disconnect → onClose → removeSession → publish session.end → meeting tracking stops
Team Connect → onOpen → addParticipant → publish participant.join
Team Disconnect → onClose → removeParticipant → publish participant.leave

Redis Channels (existing):
- realtime.audio.{sessionId} — per-session audio frames (base64 encoded)
- realtime.session.start — session start events
- realtime.session.end — session end events

Redis Channels (new):
- meeting.alert.{sessionId}.shared — shared alerts
- meeting.alert.{sessionId}.user.{userId} — personal alerts
- meeting.utterance.{sessionId} — processed utterances (broadcast to all)
- meeting.topic.{sessionId} — topic change events
```

### STT Package Details (Already Built, Needs Changes)

The `packages/stt` package has Deepgram integration but needs:
- Diarization enabled (`diarize: true`)
- Diarization index parsing from Deepgram responses
- Removal of `source → speaker` identity mapping
- `SttResult` to carry `diarizationIndex` instead of `Speaker`

### Not Started

- Voice embedding Python microservice
- Multi-user session join flow
- Speaker identification (diarization → voiceprint → SpeakerIdentity)
- New tier system (pre-filter, Tier 2 small LLM, Tier 3 embedding search)
- Commitment ledger with embeddings
- Alert routing (shared + personal channels)
- 12 alert categories
- Speaker state tracker (tone trajectory, engagement)
- Frontend UI
- Post-meeting workers
- Assistant mode

---

## Week 1: Codebase Migration & Multi-User Foundation

**Goal:** Update all existing code to the new multi-user, TEAM/EXTERNAL speaker model. Set up multi-user session infrastructure.

### Day 1-2: Speaker Model Migration ✓ COMPLETED

**packages/stt + packages/meeting-mode**

> **Note:** Day 1-2 and Day 3-4 were completed in a single pass since the speaker model migration and Deepgram diarization changes were tightly coupled. All items compile cleanly (zero TS errors, zero lint errors).

- [x] Create shared `SpeakerIdentity` type in `packages/meeting-mode/src/utterance/types.ts`
- [x] Remove `Speaker = "YOU" | "THEM"` from `packages/stt/src/types.ts`
- [x] Remove `Speaker = "YOU" | "THEM"` from `packages/meeting-mode/src/utterance/types.ts`
- [x] Update `SttResult` in `packages/stt/src/types.ts` — replace `speaker: Speaker` with `diarizationIndex: number`
- [x] Update `Utterance` in `packages/meeting-mode/src/utterance/types.ts` — replace `speaker: Speaker` with `speaker: SpeakerIdentity`
- [x] Update `RingBuffer.getBySpeaker()` → replaced with `getBySpeakerType()`, `getBySpeakerId()`, `getByUserId()`
- [x] Update `RingBuffer` format method — uses `speaker.name`
- [x] Update `UtteranceMerger.shouldMerge()` — compares `speakerId`
- [x] Update `UtteranceFinalizer` — uses `createUnidentifiedSpeaker(diarizationIndex)`, defers identity to voice embedding
- [x] Update `ContextAssembler` — filters by `speakerType`/`speakerId`/`userId`, renamed to `teamUtterances`/`externalUtterances`/`uniqueSpeakers`

**Deliverable:** All existing code compiles with new speaker model. No remaining `"YOU" | "THEM"` references. ✓

### Day 3-4: Deepgram Diarization Updates ✓ COMPLETED

**packages/stt**

- [x] Add `diarize: true` to `DEFAULT_DG_CONFIG` in `packages/stt/src/deepgram/types.ts`
- [x] Update `TranscriptResult` type to include diarization fields (`DeepgramWord` with `speaker?: number`)
- [x] Update `DeepgramConnection` — parse speaker index from `words[0].speaker`
- [x] Remove `currentSource === "mic" ? "YOU" : "THEM"` logic in `connection.ts`
- [x] Emit `SttResult` with `diarizationIndex` instead of `speaker`
- [ ] Test diarization output with multi-speaker audio (requires live Deepgram connection)
- [ ] Handle edge case: diarization not ready yet (first few seconds) — emit with `diarizationIndex: -1`

**Deliverable:** Deepgram emits utterances with speaker diarization indices, not binary YOU/THEM. ✓ (core implementation complete, edge case handling remaining)

### Day 5-6: Multi-User Session Model

**apps/realtime + apps/control**

- [ ] Update `apps/realtime/src/session.ts` — support multiple connections per meeting session:
  ```ts
  interface SessionConnection {
    userId: string
    role: "host" | "participant"
    socket: WebSocket
    connectedAt: number
  }
  // Map<sessionId, SessionConnection[]>
  ```
- [ ] Update `on-upgrade` handler — validate user identity and role from auth token/query params
- [ ] Update `on-message` handler — only accept audio frames from host connections
- [ ] Update `on-close` handler — distinguish host disconnect (ends session) from participant disconnect (just leaves)
- [ ] Add broadcast mechanism — send processed utterances/alerts to all session connections
- [ ] Update `apps/control/src/services/meeting-session.service.ts`:
  - [ ] Expand `SessionData` with `hostUserId`, `participants[]`, `orgId`, `clientId`
  - [ ] Add `join()` method for team members
  - [ ] Add participant tracking in Redis
- [ ] Add `POST /meeting-session/join` endpoint to control API
- [ ] Add `GET /meeting-session/:id/participants` endpoint
- [ ] Update `startSessionSchema` validator — host always sends tab audio

**Deliverable:** Multiple team members can join a shared meeting session. Host sends audio, participants receive results.

### Day 7: Redis Channels & Alert Routing Infrastructure

**packages/infra/redis + packages/meeting-mode**

- [ ] Add new Redis key patterns to `packages/infra/redis/keys.ts`:
  - [ ] `meeting.alert.{sessionId}.shared`
  - [ ] `meeting.alert.{sessionId}.user.{userId}`
  - [ ] `meeting.commitment.{sessionId}`
  - [ ] `meeting.speaker.{sessionId}`
  - [ ] `meeting.session.{sessionId}.participants`
- [ ] Implement alert publisher that routes to shared vs personal channels
- [ ] Implement alert subscriber (per Larity instance — subscribes to shared + own personal channel)
- [ ] Test pub/sub with multiple subscribers per session

**Deliverable:** Redis infrastructure supports shared and personal alert channels for multi-user sessions.

---

## Week 2: Voice Embedding Service & Speaker Identification

**Goal:** Build the voice embedding Python microservice and integrate speaker identification into the pipeline.

### Day 8-9: Voice Embedding Python Microservice

**services/voice-embedding** (new Python service)

- [ ] Set up Python project structure (FastAPI or Flask)
- [ ] Integrate voice embedding model (pyannote / wespeaker / resemblyzer — benchmark all three)
- [ ] Implement endpoints:
  - [ ] `POST /embedding/extract` — extract embedding vector from audio segment bytes
  - [ ] `POST /embedding/compare` — compare embedding against stored voiceprints (cosine similarity)
  - [ ] `POST /embedding/identify` — given audio segment + team voiceprints, return best match or "unknown"
- [ ] Add batch identification endpoint (multiple segments at once for efficiency)
- [ ] Load team voiceprints into memory at startup/per-session
- [ ] Benchmark latency: target <100ms per embedding extraction, <5ms per similarity check
- [ ] Docker container for the service

**Deliverable:** Python microservice can extract voice embeddings and identify speakers against known voiceprints.

### Day 10-11: Voiceprint Onboarding Flow

**apps/control + packages/infra/prisma**

- [ ] Add `Voiceprint` model to Prisma schema:
  ```prisma
  model Voiceprint {
    id        String   @id @default(cuid())
    userId    String   @unique
    user      User     @relation(fields: [userId], references: [id])
    embedding Float[]  // Voice embedding vector (512-dimensional)
    sampleDuration Int // Duration of voice sample in seconds
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
  }
  ```
- [ ] Add voiceprint recording endpoint: `POST /users/:id/voiceprint`
  - [ ] Accept ~30 second audio sample
  - [ ] Send to voice embedding service for extraction
  - [ ] Store embedding vector in database
- [ ] Add voiceprint status endpoint: `GET /users/:id/voiceprint/status`
- [ ] Add voiceprint deletion endpoint: `DELETE /users/:id/voiceprint`
- [ ] Add team voiceprints preload on session start (query all org members' voiceprints)
- [ ] Desktop app: onboarding screen with voice sample recording (can be placeholder UI for now)

**Deliverable:** Team members can record voice samples, embeddings are stored, and loaded at session start.

### Day 12-13: Speaker Identification Pipeline

**packages/meeting-mode (new module: speaker-identification)**

- [ ] Create `SpeakerIdentifier` class:
  ```ts
  class SpeakerIdentifier {
    // Pre-loaded team voiceprints (userId → embedding vector)
    private teamVoiceprints: Map<string, { userId: string; name: string; embedding: number[] }>
    // Diarization index → identified speaker mapping (builds up over time)
    private identifiedSpeakers: Map<number, SpeakerIdentity>
    // Buffer of unidentified utterances (for retroactive reprocessing)
    private unidentifiedBuffer: Utterance[]
  }
  ```
- [ ] Implement identification flow:
  1. Receive utterance with `diarizationIndex` from STT
  2. If diarization index already identified → use cached identity
  3. If not → send audio segment to voice embedding service
  4. Compare against team voiceprints (cosine similarity)
  5. If match (similarity > threshold) → TEAM with userId
  6. If no match → EXTERNAL with name from calendar data (best-effort)
- [ ] Implement retroactive reprocessing:
  - [ ] When a diarization index gets identified for the first time
  - [ ] Reprocess all buffered utterances from that index with correct identity
  - [ ] Re-emit corrected utterances to all subscribers
- [ ] Conservative defaults: unidentified speakers treated as EXTERNAL
- [ ] Confidence scoring: track identification confidence per speaker
- [ ] Persist speaker mapping in Redis (`meeting.speaker.{sessionId}`)

**Deliverable:** Diarized utterances get resolved to SpeakerIdentity (TEAM with user linkage, or EXTERNAL).

### Day 14: Integration — STT → Speaker Identification → Utterance

**packages/stt + packages/meeting-mode**

- [ ] Wire full pipeline: Audio → Deepgram (diarized) → SttResult (with diarizationIndex) → SpeakerIdentifier → Utterance (with SpeakerIdentity)
- [ ] Update `UtteranceFinalizer` to wait for speaker identification before emitting final utterance
- [ ] Handle timing: if identification takes >200ms, emit utterance with `confidence: 0` and retroactively update
- [ ] Broadcast identified utterances to all session participants via Redis
- [ ] End-to-end test: multi-speaker audio → correctly identified TEAM/EXTERNAL speakers
- [ ] Test with 3+ speaker audio (simulating team meeting)

**Deliverable:** Complete audio → identified utterance pipeline working end-to-end.

---

## Week 3: State Management & New Tier System

**Goal:** Build the three memory layers, new tier system (pre-filter → structural → small LLM → embeddings), and commitment ledger.

### Day 15-16: Topic State Management

**packages/meeting-mode**

- [ ] Define `TopicState` interface (per meeting-mode.md spec, including completeness tracking)
- [ ] Integrate embedding model (OpenAI `text-embedding-3-small`)
- [ ] Implement topic centroid calculation and comparison
- [ ] Build topic assignment logic (similarity threshold)
- [ ] Implement rolling topic summary (compressed, not raw)
- [ ] Add topic state persistence in Redis (per session)
- [ ] Publish topic change events to Redis (`meeting.topic.{sessionId}`)
- [ ] Broadcast topic changes to all connected participants

**Deliverable:** Utterances are assigned to semantic topics that persist across the meeting.

### Day 17-18: Commitment Ledger (Redis, Entire Meeting)

**packages/meeting-mode**

- [ ] Define `Commitment` interface with `SpeakerIdentity` (per meeting-mode.md):
  ```ts
  interface Commitment {
    id: string
    statement: string
    normalizedStatement: string
    speaker: SpeakerIdentity       // Full speaker identity (TEAM/EXTERNAL)
    topicId: string
    type: CommitmentType
    status: "tentative" | "confirmed" | "contradicted" | "superseded"
    timestamp: number
    utteranceId: string
    embedding: number[]            // For Tier 3 similarity search
    relatedCommitments: string[]
    contradicts?: string
    supersedes?: string
    extractedData?: {
      deadline?: string
      quantity?: number
      scope?: string[]
      amount?: number
      currency?: string
    }
  }
  ```
- [ ] Implement commitment ledger in Redis (`meeting.commitment.{sessionId}`)
- [ ] Add embedding vector storage per commitment (for Tier 3 search)
- [ ] Implement commitment search: find similar commitments by embedding similarity
- [ ] Implement cross-speaker search: find commitments from OTHER speakers on same topic/type
- [ ] Implement status evolution logic (tentative → confirmed → contradicted → superseded)
- [ ] Add relationship tracking (contradiction, supersession, confirmation)
- [ ] Wire: Tier 2 writes commitments to ledger, Tier 3 searches ledger

**Deliverable:** Commitment ledger tracks all commitments with embeddings across the entire meeting, searchable for contradiction detection.

### Day 19-20: Constraint Ledger + Context Preload

**packages/meeting-mode + apps/control**

- [ ] Define `Constraint` interface with `SpeakerIdentity`
- [ ] Implement constraint extraction from preloaded data (decisions, policies from PostgreSQL)
- [ ] Build constraint detection from utterances (structural: dates, numbers, dependencies)
- [ ] Add delta comparison logic (new vs existing constraints)
- [ ] Persist constraint ledger in Redis per session
- [ ] Implement context preload on session start:
  - [ ] Open decisions (client-scoped)
  - [ ] Known constraints
  - [ ] Active policy guardrails (org-wide)
  - [ ] Prior commitments (from previous meetings)
  - [ ] Client name list (for Tier 1 blocklist)
  - [ ] Org-configured keyword blocklists
  - [ ] Calendar agenda items
- [ ] Cache preloaded context in Redis for session duration

**Deliverable:** Constraint tracking and context preloading operational.

### Day 21: Pre-filter & Tier 1 — Structural Detection

**packages/meeting-mode**

- [ ] **Pre-filter implementation (Free, <10ms):**
  - [ ] Less than 3 words → DROP
  - [ ] Pure acknowledgment detection ("ok", "yeah", "mm-hmm", "right", "haan", "theek hai") → DROP
  - [ ] Exact/near-duplicate of recent utterance → DROP
  - [ ] Target: kill ~30-40% of utterances

- [ ] **Tier 1: Structural Detection (Free, <50ms):**
  - [ ] Date/time extraction (number/calendar format parsing — language-agnostic)
  - [ ] Number extraction ($, %, quantities — structural patterns)
  - [ ] Org-configured keyword blocklist matching (exact + fuzzy)
  - [ ] Technical pattern detection (API keys, SSH keys, long hashes, credentials)
  - [ ] Client name matching from preloaded list
  - [ ] **Tier 1 is an accelerator, NOT a gate** — fires instant alerts but everything passes through to Tier 2

**Deliverable:** Pre-filter kills noise, Tier 1 catches structural patterns instantly. No regex pattern libraries for semantic detection.

---

## Week 4: LLM-Based Classification & Embedding Search

**Goal:** Build Tier 2 (small LLM), Tier 3 (embedding search), and Tier 4 (deep reasoning).

### Day 22-23: Tier 2 — Small LLM Classification

**packages/meeting-mode**

- [ ] Set up OpenRouter / Vercel AI SDK integration for small LLM (GPT-4o-mini / Haiku)
- [ ] Define Tier 2 input schema:
  ```ts
  interface Tier2Input {
    utterance: string
    speaker: SpeakerIdentity
    recentSameSpeaker: string[]    // Last 2-3 utterances from same speaker
    topicLabel?: string
  }
  ```
- [ ] Define Tier 2 output schema (Zod-enforced):
  ```ts
  interface Tier2Classification {
    intent: "commitment" | "decision" | "question" | "concern" | "filler" | "general"
    commitmentType: "timeline" | "scope" | "resource" | "price" | "capability" | null
    tone: "neutral" | "defensive" | "aggressive" | "hesitant" | "confident"
    riskSignals: string[]
    extractedData: {
      deadline?: string
      quantity?: number
      scope?: string
      amount?: number
      currency?: string
    }
    confidence: number
  }
  ```
- [ ] Build LLM prompt template for classification (multilingual, semantic)
- [ ] Implement cross-utterance context (fetch last 2-3 from same speaker from ring buffer)
- [ ] Implement gate logic:
  - [ ] `filler`/`general` + no risk signals + confidence > 0.8 → STOP (don't proceed to Tier 4)
  - [ ] `commitment`/`decision` → write to commitment ledger immediately (with embedding)
  - [ ] Everything continues to Tier 3 regardless
- [ ] Add response validation and timeout (200ms max, fail-silent)
- [ ] Test with multilingual utterances (English, Hindi, Hinglish)

**Deliverable:** Every utterance is classified by small LLM — replaces ALL old regex pattern libraries. Works in any language.

### Day 24-25: Tier 3 — Embedding Search & Novelty Check

**packages/meeting-mode**

- [ ] Set up pgvector search functions:
  - [ ] Past decisions (client-scoped)
  - [ ] Past commitments (client-scoped)
  - [ ] Policy guardrails (org-wide)
  - [ ] Important points
- [ ] Implement three parallel checks:
  - [ ] **Novelty check:** Embedding-based deduplication within current meeting
  - [ ] **Memory search:** Vector search against pgvector (top-K, similarity > threshold)
  - [ ] **Commitment ledger search:** Compare against ALL commitments from THIS meeting (Redis)
- [ ] Implement forcing logic:
  - [ ] Memory match found → force Tier 4
  - [ ] Commitment ledger match found (potential contradiction) → force Tier 4
  - [ ] No matches + Tier 2 said stop → STOP
- [ ] Optimize: batch embedding generation, connection pooling for pgvector
- [ ] Target latency: <100ms total for all three checks

**Deliverable:** Tier 3 catches conflicts with organizational memory and intra-meeting contradictions that Tier 2 might miss.

### Day 26-27: Tier 4 — Deep LLM Reasoning

**packages/meeting-mode**

- [ ] Set up large LLM integration (GPT-4o / Claude Sonnet via OpenRouter)
- [ ] Define Tier 4 context assembly:
  ```ts
  interface Tier4Context {
    utterance: string
    tier2Classification: Tier2Classification
    speaker: SpeakerIdentity
    topicSummary: string
    recentUtterances: Utterance[]              // Ring buffer
    matchedHistoricalItems: HistoricalMatch[]  // From pgvector
    matchedCommitments: CommitmentMatch[]      // From commitment ledger
    relevantConstraints: Constraint[]
  }
  ```
- [ ] Define Tier 4 output schema (Zod-enforced):
  ```ts
  interface Tier4Response {
    alertType: AlertCategory | "none"
    severity: "low" | "medium" | "high" | "critical"
    message: string
    suggestion?: string
    confidence: number
    shouldSurface: boolean
    reasoning: string
    routing: "shared" | "personal" | "both"
    targetUserId?: string
  }
  ```
- [ ] Build prompt templates for all alert categories
- [ ] Implement streaming response handling (progressive feedback)
- [ ] Implement timeout (500ms max) and fail-silent logic
- [ ] Add response validation and schema enforcement

**Deliverable:** Tier 4 can reason about contradictions, risks, and conflicts and generate structured alerts with routing.

### Day 28: Pipeline Integration

**packages/meeting-mode**

- [ ] Wire complete pipeline: Pre-filter → Tier 1 → Tier 2 → Tier 3 → Tier 4
- [ ] Implement pipeline orchestration (parallel where possible, sequential where dependent)
- [ ] Add pipeline metrics (latency per tier, drop rate, force-to-Tier-4 rate)
- [ ] End-to-end test: utterance with commitment → Tier 2 writes to ledger → later contradicting utterance → Tier 3 catches → Tier 4 confirms → alert generated
- [ ] Test cost estimation against budget (~$0.30 per hour-long meeting)

**Deliverable:** Complete four-tier pipeline operational with correct flow control.

---

## Week 5: Alert System & Speaker State Tracking

**Goal:** Build all 12 alert categories, alert routing, and speaker behavioral tracking.

### Day 29-30: Alert System Core

**packages/meeting-mode**

- [ ] Define all 12 alert categories:
  ```ts
  type AlertCategory =
    | "self_contradiction"
    | "team_inconsistency"
    | "risky_commitment"
    | "scope_creep"
    | "client_backtrack"
    | "missing_clarity"
    | "information_risk"
    | "tone_warning"
    | "pressure_detected"
    | "policy_violation"
    | "client_disengagement"
    | "undiscussed_agenda"
  ```
- [ ] Implement `Alert` interface with routing field (`shared` / `personal` / `both`)
- [ ] Build Alert Queue Manager:
  - [ ] Priority ordering by category (policy_violation highest, undiscussed_agenda lowest)
  - [ ] Max 2 visible alerts at a time per user
  - [ ] Pending queue for overflow
  - [ ] Recently shown tracking for deduplication
  - [ ] Auto-expiry (10-30 seconds based on severity)
- [ ] Implement alert routing publisher:
  - [ ] Publish to `meeting.alert.{sessionId}.shared` for shared alerts
  - [ ] Publish to `meeting.alert.{sessionId}.user.{userId}` for personal alerts
  - [ ] Publish to BOTH channels for `information_risk` and `policy_violation`
- [ ] Implement routing rules per category (per meeting-mode.md Section 7.2)
- [ ] Add alert deduplication (same category + same topic within debounce window)
- [ ] Add alert logging for post-meeting analysis

**Deliverable:** Alert system generates, routes, queues, and deduplicates alerts across shared and personal channels.

### Day 31-32: Alert Category Implementations (Contradiction & Inconsistency)

**packages/meeting-mode**

- [ ] **Self-Contradiction Detection:**
  - [ ] On commitment utterance: Tier 3 searches ledger for same speaker's prior commitments
  - [ ] If similar found → Tier 4 evaluates if genuine contradiction
  - [ ] Routing: own speech → personal, team member's speech → shared
  - [ ] Types: timeline, scope, capability, quantity, general

- [ ] **Team Inconsistency Detection (NEW):**
  - [ ] On TEAM commitment: Tier 3 searches ledger for OTHER TEAM members' commitments
  - [ ] If conflicting commitment from different TEAM member → Tier 4 evaluates
  - [ ] Always shared alert — all team members must align
  - [ ] Cross-speaker comparison within TEAM type only

- [ ] **Client Backtracking Detection:**
  - [ ] On EXTERNAL commitment: Tier 3 searches ledger for prior EXTERNAL commitments
  - [ ] If conflicting → Tier 4 evaluates
  - [ ] Always shared alert

**Deliverable:** Contradiction, team inconsistency, and backtracking alerts working across speakers.

### Day 33-34: Alert Category Implementations (Risk & Behavioral)

**packages/meeting-mode**

- [ ] **Risky Commitment Alerts:**
  - [ ] Tier 2 identifies risk signals (unconditional, underestimation, open-ended, authority)
  - [ ] Routing: own speech → personal, team member → shared

- [ ] **Scope Creep Alerts:**
  - [ ] Tier 2 classifies EXTERNAL utterances as scope expansion
  - [ ] Compare against preloaded scope baseline
  - [ ] Always shared

- [ ] **Pressure Detected Alerts:**
  - [ ] Tier 2 identifies pressure tactics from EXTERNAL speakers
  - [ ] Social proof, urgency, authority, guilt, threats — all via LLM classification
  - [ ] Always shared

- [ ] **Information Risk Alerts:**
  - [ ] Tier 1 catches structural patterns (API keys, client name matches)
  - [ ] Tier 2 catches semantic risks (financial disclosure, roadmap leaks, strategy)
  - [ ] Routing: BOTH (shared + personal to speaker)

- [ ] **Tone Warning Alerts:**
  - [ ] Tier 2's `tone` field identifies defensive/aggressive/reactive
  - [ ] Routing: own speech → personal, team member → shared

- [ ] **Policy Violation Alerts:**
  - [ ] Tier 1 blocklist matches + Tier 2 semantic detection
  - [ ] Routing: BOTH (shared + personal to speaker)

**Deliverable:** All risk and behavioral alert categories operational with correct routing.

### Day 35: Speaker State Tracker & Engagement Alerts

**packages/meeting-mode**

- [ ] Implement `SpeakerState` tracker:
  ```ts
  interface SpeakerState {
    speakerId: string
    speaker: SpeakerIdentity
    toneHistory: { tone: string; timestamp: number }[]
    avgResponseLength: number
    responseFrequency: number
    lastSpoke: number
    toneTrajectory: "stable" | "escalating" | "de-escalating"
    engagementLevel: "active" | "passive" | "disengaged"
  }
  ```
- [ ] Track rolling tone scores per speaker (from Tier 2 classifications)
- [ ] **Gradual tone shift detection:**
  - [ ] Alert when delta exceeds threshold over time window (~15 min)
  - [ ] Even if no single utterance is alarming
- [ ] **Client disengagement detection:**
  - [ ] Track response length ratio (TEAM vs EXTERNAL)
  - [ ] Flag when EXTERNAL gives only brief responses (1-3 words) for extended period
  - [ ] Flag when EXTERNAL response frequency drops significantly
- [ ] **Missing clarity detection:**
  - [ ] On topic shift, evaluate outgoing topic completeness (owner, deadline, actions, confirmation)
  - [ ] Skip trivial topics
  - [ ] Always shared alert
- [ ] **Undiscussed agenda detection:**
  - [ ] Compare discussed topics against preloaded calendar agenda
  - [ ] Fire at meeting end only
  - [ ] Always shared alert

**Deliverable:** Speaker behavioral tracking and engagement-based alerts working.

### Day 36: Speculative Processing & Optimizations

**packages/meeting-mode**

- [ ] Implement speculative processing on partial utterances (confidence > 0.7):
  - [ ] Start Tier 2 classification speculatively
  - [ ] Identify likely topic from partial text
  - [ ] Pre-fetch relevant constraints
  - [ ] Pre-warm LLM connection for high-signal keywords
- [ ] Build speculative cache with validation on final utterance
- [ ] Implement speculative discard logic (text mismatch > 30%)
- [ ] Add predictive constraint loading:
  - [ ] Agenda parsing from calendar
  - [ ] Topic prediction from meeting title/agenda
  - [ ] Hot cache for topic → constraint mappings
- [ ] Implement speaker-aware processing priority:
  - [ ] Current user's speech: parallel tiers, lower threshold (0.7), priority LLM queue
  - [ ] Other TEAM speech: standard processing
  - [ ] EXTERNAL speech: sequential, higher threshold (0.85)
- [ ] Add confidence threshold tuning per alert category (Silent Collaborator thresholds)

**Deliverable:** Latency optimizations and processing priority working. ~200-300ms saved via speculation.

---

## Week 6: Frontend & End-to-End Integration

**Goal:** Build the meeting mode UI with all alert categories and complete the end-to-end flow.

### Day 37-38: Desktop App Foundation

**apps/desktop**

- [ ] Set up React Router with app shell
- [ ] Create navigation structure (Dashboard, Meeting Mode, Settings, Onboarding)
- [ ] Build WebSocket connection manager (to **remote** realtime server)
- [ ] Implement session state in React context
- [ ] Create audio capture hook using Tauri APIs (tab audio for host)
- [ ] Build audio streaming to WebSocket (binary frames) — host only
- [ ] Add connection status indicator
- [ ] Build voiceprint recording screen (onboarding flow)

**Deliverable:** Desktop app can capture audio (host) and stream to remote server.

### Day 39-40: Ambient UI Components

**apps/desktop**

- [ ] **Topic Indicator Component**
  - [ ] Subscribe to topic change events
  - [ ] Display current topic label
  - [ ] Smooth transition animation on topic shift
- [ ] **Constraint Counter Component**
  - [ ] Display count of tracked constraints
  - [ ] Pulse animation on increment
- [ ] **Commitment Counter Component**
  - [ ] Display TEAM vs EXTERNAL commitment counts
  - [ ] Visual indicator for contradictions detected
- [ ] **Listening Heartbeat Component**
  - [ ] Visual audio processing indicator
  - [ ] Disappears on stream drop (error signal)
- [ ] **Participant List Component**
  - [ ] Show connected team members
  - [ ] Speaker identification status (identified / pending)
  - [ ] Host indicator

**Deliverable:** Ambient awareness layer proving system is alive for all connected participants.

### Day 41-42: Alert System UI (All 12 Categories)

**apps/desktop**

- [ ] Subscribe to shared alert channel + personal alert channel (via WebSocket)
- [ ] Build alert queue in React state (max 2 visible, priority-ordered)
- [ ] Implement auto-expire (10-30 seconds based on severity)
- [ ] Create dismissible alert component with:
  - [ ] Title (category-based)
  - [ ] Message (actionable)
  - [ ] Suggestion (optional)
  - [ ] **Shared/Personal badge** (so user knows who sees the alert)
  - [ ] Dismiss button
- [ ] Alert animations (slide in, fade out)
- [ ] **Style alerts by category** (12 distinct styles):
  - [ ] Self-contradiction: Yellow border
  - [ ] Team inconsistency: Orange border
  - [ ] Risky commitment: Orange border, warning icon
  - [ ] Scope creep: Blue border
  - [ ] Client backtrack: Purple border
  - [ ] Pressure detected: Red border
  - [ ] Missing clarity: Gray border
  - [ ] Information risk: Red border, lock icon
  - [ ] Tone warning: Yellow border
  - [ ] Policy violation: Red border, bold
  - [ ] Client disengagement: Gray border, engagement icon
  - [ ] Undiscussed agenda: Blue border (meeting end only)
- [ ] Add "Checking..." indicator for pending LLM calls
- [ ] Hover-to-pause expiry

**Deliverable:** All 12 alert categories render with distinct styling and shared/personal distinction.

### Day 43: Meeting Mode Screen

**apps/desktop**

- [ ] Build meeting mode main screen layout
- [ ] Integrate all ambient UI components
- [ ] Add meeting controls:
  - [ ] **Start Meeting Mode** button (host)
  - [ ] **Join Meeting Session** button (participant)
  - [ ] End Meeting button
- [ ] Display session state (connected, duration, participants, utterance count)
- [ ] Basic live transcript viewer (scrolling, with speaker names and TEAM/EXTERNAL labels)
- [ ] Show constraint/commitment counts
- [ ] Alert category toggle (enable/disable specific categories)

**Deliverable:** Complete meeting mode UI with multi-user support and all alert categories.

### Day 44-46: End-to-End Integration & Testing

**All apps**

- [ ] Integration test: full pipeline
  ```
  Host audio capture → WebSocket → Remote server → Deepgram (diarized) →
  Speaker identification (voice embeddings) → Utterance (with SpeakerIdentity) →
  Pre-filter → Tier 1 → Tier 2 (small LLM) → Tier 3 (embedding search) →
  Tier 4 (large LLM) → Alert (with routing) → Shared/Personal channels →
  All connected Larity instances
  ```
- [ ] Test each alert category end-to-end (12 scenarios):
  - [ ] Self-contradiction (same speaker, different times)
  - [ ] Team inconsistency (two TEAM members contradict)
  - [ ] Risky commitment (unconditional promise)
  - [ ] Scope creep (client adds scope)
  - [ ] Client backtrack (client changes terms)
  - [ ] Pressure tactics (urgency, social proof)
  - [ ] Missing clarity (topic ends without owner/deadline)
  - [ ] Information risk (client name mentioned, API key)
  - [ ] Tone warning (defensive response)
  - [ ] Policy violation (blocklist term)
  - [ ] Client disengagement (brief responses)
  - [ ] Undiscussed agenda (meeting end)
- [ ] Test multi-user scenario:
  - [ ] Host + 2 participants connected
  - [ ] Shared alerts visible to all
  - [ ] Personal alerts visible only to target user
  - [ ] Participant join/leave
  - [ ] Host disconnect stops tracking
- [ ] Test speaker identification:
  - [ ] 3+ speakers correctly identified
  - [ ] Team members matched to voiceprints
  - [ ] External speakers labeled correctly
  - [ ] Retroactive reprocessing works
- [ ] Performance testing against latency budgets:
  - [ ] Pre-filter: <10ms
  - [ ] Tier 1: <50ms
  - [ ] Tier 2 (small LLM): <200ms
  - [ ] Tier 3 (embedding search): <100ms
  - [ ] Tier 4 (large LLM): <500ms
  - [ ] Voice identification: <100ms
  - [ ] End-to-end: <800ms
- [ ] Cost verification (~$0.30 per hour-long meeting)
- [ ] Add structured logging throughout pipeline
- [ ] Implement basic observability (timing metrics)
- [ ] Fix bugs and edge cases

**Deliverable:** Working multi-user meeting mode with all 12 alert categories, voice identification, and tiered LLM pipeline end-to-end.

---

## Week 7: Post-Meeting Pipeline

**Goal:** Process completed meetings, extract insights, and write to persistent memory.

### Day 47-48: Worker Infrastructure

**apps/workers**

- [ ] Set up worker app structure
- [ ] Implement RabbitMQ consumer base class
- [ ] Create worker lifecycle management (graceful shutdown)
- [ ] Add health check endpoints
- [ ] Implement job retry logic with exponential backoff
- [ ] Set up worker logging and metrics

**Deliverable:** Worker infrastructure ready to consume jobs.

### Day 49-50: Transcript Processing Worker

**apps/workers**

- [ ] Implement `q.meeting.transcribe` consumer
- [ ] Integrate Whisper API for batch STT refinement
- [ ] Compare Whisper output with Deepgram live transcript
- [ ] Merge/reconcile transcripts (prefer Whisper accuracy)
- [ ] **Preserve speaker identity attribution** (SpeakerIdentity, not binary)
- [ ] Store refined transcript to database
- [ ] Publish `transcript.ready` event

**Deliverable:** High-quality refined transcripts with multi-speaker attribution.

### Day 51: Speaker Diarization Refinement

**apps/workers**

- [ ] Use meeting's voice identification data to refine post-meeting speaker attribution
- [ ] Map diarized segments to identified speakers
- [ ] Update transcript with confirmed speaker identities (TEAM with names, EXTERNAL with best-effort names)
- [ ] Handle any remaining unidentified speakers
- [ ] Store final speaker mapping

**Deliverable:** Transcripts have accurate, named speaker attribution.

### Day 52-53: Decision, Task & Commitment Extraction

**apps/workers**

- [ ] Implement extraction worker for `q.meeting.summary`
- [ ] Create LLM prompts for:
  - [ ] Decision extraction (with evidence + speaker attribution)
  - [ ] Task extraction (with assignee, deadline inference)
  - [ ] Open question extraction
  - [ ] Important point extraction
- [ ] **Commitment ledger export:**
  - [ ] Read commitment ledger from Redis
  - [ ] Write to `Commitment` model in PostgreSQL (new Prisma model)
  - [ ] Generate embeddings and store in pgvector
  - [ ] These become searchable organizational memory for future meetings
- [ ] Define extraction schemas (Zod)
- [ ] Validate LLM outputs against schemas

**Deliverable:** Structured data extracted from transcripts, commitment ledger persisted as organizational memory.

### Day 54-55: Memory Writes & Integration

**apps/workers + apps/control**

- [ ] Write extracted decisions to PostgreSQL (versioned)
- [ ] Write tasks with inferred owners/deadlines
- [ ] Write open questions
- [ ] Write important points with categories
- [ ] Update meeting summary field
- [ ] Generate embeddings for vector search (pgvector):
  - [ ] Decisions
  - [ ] Commitments (from ledger)
  - [ ] Important points
  - [ ] Policy guardrails
- [ ] Publish `meeting.processed` event
- [ ] Add `/meetings/:id/insights` endpoint (decisions, tasks, questions, commitments)
- [ ] Add `/meetings/:id/transcript` endpoint (refined, speaker-attributed)
- [ ] Wire session end to trigger post-meeting jobs
- [ ] Add job status tracking in Redis

**Deliverable:** Meeting insights and commitments persisted to database, searchable via pgvector for future meetings.

---

## Week 8: Assistant Mode

**Goal:** Build the conversational assistant with knowledge access and action execution.

### Day 56-57: Vector Search Setup

**packages/infra + apps/control**

- [ ] Add pgvector extension to PostgreSQL
- [ ] Create embedding columns on relevant tables:
  - [ ] `decisions.embedding`
  - [ ] `important_points.embedding`
  - [ ] `policy_guardrails.embedding`
  - [ ] `commitments.embedding` (new)
- [ ] Implement embedding generation on insert/update
- [ ] Create vector similarity search functions
- [ ] Add search endpoint `/search` with filters (client, date range, type)

**Deliverable:** Semantic search across organizational memory including commitments.

### Day 58-59: Assistant Core

**packages/assistant** (new package)

- [ ] Create package structure
- [ ] Implement intent classifier for user queries
- [ ] Build context assembly for assistant LLM calls
- [ ] Implement RAG pipeline:
  - [ ] Query → embedding → vector search → context → LLM → response
- [ ] Add conversation history management
- [ ] Define assistant response schemas

**Deliverable:** Assistant can answer questions using organizational memory.

### Day 60-61: Action Execution

**packages/assistant + apps/control**

- [ ] Define action types (create_task, create_reminder, update_task, search_memory, calendar_query, email_draft)
- [ ] Implement action handlers
- [ ] Add confirmation flow for destructive actions
- [ ] Implement action logging for audit
- [ ] Add undo capability for recent actions

**Deliverable:** Assistant can execute actions on user's behalf.

### Day 62-63: Auto-Remembrance

**packages/assistant**

- [ ] Implement trigger detection ("Remember this", "Save this", "Add this to memory")
- [ ] Build memory structuring with LLM (categorize, generate embedding)
- [ ] Add optional confirmation gate
- [ ] Write to appropriate table with evidence
- [ ] Publish memory write event

**Deliverable:** Explicit user-commanded memory writes.

### Day 64-65: Assistant UI

**apps/desktop**

- [ ] Build chatbox component
- [ ] Implement text input with send
- [ ] Add voice input using Tauri audio APIs
- [ ] Display assistant responses with markdown
- [ ] Show action confirmations inline
- [ ] Add typing indicator for LLM processing
- [ ] Implement conversation history scroll
- [ ] Add quick action buttons

**Deliverable:** Functional assistant interface in desktop app.

### Day 66-68: Assistant Integration & Polish

**All apps**

- [ ] Wire assistant to session context (use current meeting if active)
- [ ] Add client-scoped queries (respect tenant boundaries)
- [ ] Implement assistant during meeting mode (sidebar)
- [ ] Add keyboard shortcuts for assistant
- [ ] Performance testing for search latency
- [ ] Fix bugs and edge cases
- [ ] End-to-end testing of all assistant capabilities

**Deliverable:** Fully integrated assistant mode.

---

## Timeline Summary

| Week | Days | Focus | Key Deliverables |
|------|------|-------|------------------|
| 1 | 1-7 | **Migration & Multi-User** | Speaker model migration (YOU/THEM → SpeakerIdentity), Deepgram diarization, multi-user session join, Redis alert channels |
| 2 | 8-14 | **Voice Embeddings & Speaker ID** | Python microservice, voiceprint onboarding, speaker identification pipeline, STT → identity → utterance |
| 3 | 15-21 | **State & Structural Detection** | Topic state, commitment ledger (Redis, with embeddings), constraint ledger, pre-filter, Tier 1 structural |
| 4 | 22-28 | **LLM Classification & Search** | Tier 2 small LLM (replaces all regex), Tier 3 embedding search + commitment ledger search, Tier 4 deep reasoning, pipeline integration |
| 5 | 29-36 | **Alert System & Speaker Tracking** | All 12 alert categories, alert routing (shared/personal), speaker state tracker, tone trajectory, client disengagement, speculative processing |
| 6 | 37-46 | **Frontend & E2E** | Desktop UI, ambient components, alert UI (12 categories), meeting mode screen, multi-user end-to-end testing |
| 7 | 47-55 | **Post-Meeting** | Workers, Whisper, speaker-attributed transcripts, commitment ledger → pgvector, extraction, memory writes |
| 8 | 56-68 | **Assistant** | Vector search, RAG, actions, auto-remembrance, UI |

**Total: 68 working days (~10 weeks at 7 days/week, or ~13.5 weeks with weekends)**

---

## Package Structure

```
packages/
├── infra/                    # DONE (needs Prisma additions)
│   ├── redis/                # Client, pubsub, locks, TTL, keys
│   │                         # + New alert channel keys, commitment ledger keys
│   ├── rabbitmq/             # Connection, exchanges, queues, publish/consume
│   └── prisma/               # Schema, generated client
│                             # + Voiceprint model, Commitment model
├── stt/                      # DONE (needs diarization changes)
│   ├── deepgram/
│   │   ├── client.ts         # Deepgram streaming client
│   │   ├── connection.ts     # CHANGE: diarization parsing, remove source→speaker
│   │   └── types.ts          # CHANGE: add diarize:true, diarization types
│   ├── subscriber.ts         # Redis audio subscriber
│   └── index.ts
├── meeting-mode/             # PARTIALLY DONE (major additions needed)
│   ├── utterance/
│   │   ├── types.ts          # CHANGE: Speaker→SpeakerIdentity, Utterance updated
│   │   ├── finalizer.ts      # CHANGE: defer speaker identity to voice ID step
│   │   ├── merger.ts         # CHANGE: compare speakerId not binary speaker
│   │   ├── ring-buffer.ts    # CHANGE: filter by type/speakerId not YOU/THEM
│   │   ├── persistent-ring-buffer.ts
│   │   └── buffer.ts
│   ├── speaker/                     # NEW — Voice embedding integration
│   │   ├── identifier.ts           # SpeakerIdentifier class
│   │   ├── voiceprint-loader.ts    # Load team voiceprints at session start
│   │   ├── embedding-client.ts     # HTTP client for Python microservice
│   │   └── types.ts
│   ├── state/
│   │   ├── topic-state.ts          # Topic clustering + completeness
│   │   ├── constraint-ledger.ts    # Constraint tracking
│   │   ├── commitment-ledger.ts    # NEW — Redis, entire meeting, with embeddings
│   │   ├── speaker-state.ts        # NEW — Tone trajectory, engagement metrics
│   │   └── session-state.ts
│   ├── pipeline/                    # NEW — Tiered processing pipeline
│   │   ├── pre-filter.ts           # Noise removal (<3 words, acknowledgments)
│   │   ├── tier1-structural.ts     # Language-agnostic: dates, numbers, blocklist
│   │   ├── tier2-classifier.ts     # Small LLM classification (replaces ALL regex)
│   │   ├── tier3-embedding.ts      # pgvector search + commitment ledger search
│   │   ├── tier4-reasoning.ts      # Large LLM deep reasoning
│   │   └── orchestrator.ts         # Pipeline flow control
│   ├── llm/
│   │   ├── client.ts               # OpenRouter / Vercel AI SDK
│   │   ├── prompts.ts              # Prompts for Tier 2 + Tier 4
│   │   └── schemas.ts              # Zod schemas for all LLM responses
│   ├── speculative/
│   │   ├── processor.ts
│   │   └── cache.ts
│   ├── alerts/
│   │   ├── categories/             # All 12 alert categories
│   │   │   ├── self-contradiction.ts
│   │   │   ├── team-inconsistency.ts    # NEW
│   │   │   ├── risky-commitment.ts
│   │   │   ├── scope-creep.ts
│   │   │   ├── client-backtrack.ts
│   │   │   ├── pressure-tactics.ts
│   │   │   ├── missing-clarity.ts
│   │   │   ├── info-risk.ts
│   │   │   ├── tone-warning.ts
│   │   │   ├── policy-violation.ts
│   │   │   ├── client-disengagement.ts  # NEW
│   │   │   └── undiscussed-agenda.ts    # NEW
│   │   ├── queue-manager.ts         # Priority queue, dedup, expiry
│   │   ├── router.ts               # NEW — Shared vs personal channel routing
│   │   ├── publisher.ts
│   │   └── types.ts
│   ├── context/
│   │   ├── context-assembler.ts     # CHANGE: use SpeakerIdentity not YOU/THEM
│   │   └── preloader.ts            # NEW — Context preload on session start
│   └── index.ts
├── extraction/               # Week 7
│   ├── decisions.ts
│   ├── tasks.ts
│   ├── questions.ts
│   ├── points.ts
│   ├── commitments.ts        # NEW — Commitment ledger → PostgreSQL export
│   ├── prompts.ts
│   ├── schemas.ts
│   └── index.ts
└── assistant/                # Week 8
    ├── intent/
    ├── rag/
    ├── actions/
    ├── memory/
    └── index.ts

services/
└── voice-embedding/          # NEW — Python microservice
    ├── app.py                # FastAPI service
    ├── models/               # Voice embedding models (pyannote/wespeaker)
    ├── routes/               # /embedding/extract, /embedding/compare, /embedding/identify
    ├── Dockerfile
    └── requirements.txt
```

---

## Apps Status

```
apps/
├── control/                  # DONE - Elysia API
│   └── Needs: /meeting-session/join endpoint, expanded SessionData,
│              participant tracking, voiceprint endpoints
├── realtime/                 # DONE - uWebSockets.js
│   └── Needs: multi-connection per session, host/participant roles,
│              broadcast to participants, alert channel subscriptions
├── desktop/                  # SCAFFOLD ONLY - Tauri + React
│   └── Needs: Everything (Week 6 + Week 8)
└── workers/                  # SCAFFOLD ONLY
    └── Needs: Everything (Week 7)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Deepgram latency spikes | Implement timeout + skip, don't block pipeline |
| Deepgram diarization inaccurate | Voice embeddings provide second-pass identification; diarization only provides initial segmentation |
| Voice embedding model accuracy | Benchmark pyannote vs wespeaker vs resemblyzer; fallback: unidentified → EXTERNAL (conservative) |
| Voice identification latency | Cache identified speakers; only first occurrence per diarization index needs full identification |
| Tier 2 LLM (small) too slow | 200ms timeout, fail-silent; if consistently slow, batch utterances |
| Tier 2 LLM classification quality | Test with multilingual samples; tune prompt; consider fine-tuning small model |
| Tier 4 LLM response too slow | Streaming responses, 500ms timeout, fail-silent |
| Team inconsistency false positives | Require high similarity threshold for commitment ledger match + LLM confirmation |
| Client disengagement false positives | Require sustained pattern (5+ min), not just one short response |
| Python microservice availability | Health checks, auto-restart; if down, all speakers treated as EXTERNAL |
| Multi-user WebSocket complexity | Clear host/participant role separation; host disconnect = session end (simple) |
| Redis pub/sub message loss | Accept loss for non-critical data; alerts use reliable delivery where possible |
| Speculative processing low hit rate | Monitor hit rate, adjust confidence threshold dynamically |
| Topic clustering inaccurate | Start with simple embedding, tune threshold iteratively |
| Whisper API latency | Async processing, user doesn't wait |
| Vector search slow | Add indexes, limit result count, cache frequent queries |
| **Commitment ledger grows large** | Cap at 500 commitments per meeting; oldest low-priority ones archived |
| **Cost exceeds budget** | Monitor per-meeting cost; adjust Tier 2 gate aggressiveness to reduce Tier 4 calls |
| **Alert fatigue** | Max 2 visible, priority queue, per-category confidence thresholds, Silent Collaborator mode |

---

## Success Metrics

### End of Week 2 (Speaker Identification Complete)

| Metric | Target |
|--------|--------|
| Voice identification accuracy (known speakers) | > 90% |
| Diarization index → speaker mapping time | < 100ms |
| False identification rate (wrong team member) | < 5% |
| Retroactive reprocessing latency | < 500ms |

### End of Week 4 (Pipeline Complete)

| Metric | Target |
|--------|--------|
| Pre-filter drop rate | ~30-40% |
| Tier 1 (structural) latency | < 50ms |
| Tier 2 (small LLM) latency | < 200ms |
| Tier 3 (embedding search) latency | < 100ms |
| Tier 4 (large LLM) streaming start | < 300ms |
| Tier 4 (large LLM) complete | < 500ms |
| Tier 2 classification accuracy | > 85% |
| Tier 2 multilingual accuracy (Hindi/Hinglish) | > 80% |
| Commitment ledger write latency | < 50ms |
| Cost per 1-hour meeting | < $0.35 |

### End of Week 5 (Alert System Complete)

| Metric | Target |
|--------|--------|
| Self-contradiction detection accuracy | > 85% |
| Team inconsistency detection accuracy | > 80% |
| Risky statement detection accuracy | > 80% |
| Scope creep detection accuracy | > 75% |
| Pressure tactic detection accuracy | > 80% |
| Information risk detection accuracy | > 90% |
| Client disengagement detection accuracy | > 70% |
| False positive rate (all categories) | < 15% |
| Alert routing correctness (shared/personal) | 100% |
| Alert queue processing latency | < 50ms |

### End of Week 6 (Meeting Mode Complete)

| Metric | Target |
|--------|--------|
| Audio → identified utterance latency | < 300ms |
| End-to-end (utterance → alert) | < 800ms |
| Multi-user sync (alert appears for all) | < 100ms delta |
| All 12 alert categories functional | 100% |
| Speculative processing hit rate | > 80% |
| Alert render latency | < 32ms |
| 3-speaker identification accuracy | > 85% |

### End of Week 7 (Post-Meeting Complete)

| Metric | Target |
|--------|--------|
| Transcript processing time | < 5 min per hour |
| Decision extraction accuracy | > 85% |
| Task extraction accuracy | > 80% |
| Commitment persistence accuracy | > 95% |
| Memory write success rate | > 99% |

### End of Week 8 (Assistant Complete)

| Metric | Target |
|--------|--------|
| Vector search latency | < 200ms |
| Assistant response time | < 2s |
| Action execution success rate | > 95% |
| Query relevance (user satisfaction) | > 80% |

---

## Dependencies

### External Services
- **Deepgram** — Streaming STT with diarization (API key required)
- **OpenAI Whisper API** — Batch STT refinement (post-meeting)
- **OpenRouter** — LLM routing for Tier 2 (GPT-4o-mini/Haiku), Tier 4 (GPT-4o/Sonnet), extraction, assistant
- **OpenAI** — Embeddings (text-embedding-3-small) for topic clustering, commitment embeddings, vector search

### Infrastructure
- **Redis** — Already configured in packages/infra. Needs new key patterns for multi-user.
- **PostgreSQL + pgvector** — Already configured with Prisma. Needs pgvector extension + new models (Voiceprint, Commitment).
- **RabbitMQ** — Already configured for worker queues. May need additional queues for voice processing.

### New Service
- **Python microservice** — Voice embedding extraction and speaker identification. Runs alongside the server. Docker-containerized. Uses pyannote/wespeaker/resemblyzer.

---

## Key Differences from Previous Timeline

| Aspect | Previous | Now |
|--------|----------|-----|
| **Speaker model** | `"YOU" \| "THEM"` binary | `SpeakerIdentity` with TEAM/EXTERNAL, userId, name |
| **Speaker identification** | Audio source (mic=YOU, tab=THEM) | Voice embeddings + diarization via Python microservice |
| **Processing location** | Local (Tauri-spawned) | Remote shared server |
| **Session model** | Single user | Multi-user (host + participants) |
| **Tier 1** | Regex pattern libraries (risky, pressure, tone, scope, etc.) | Structural only (dates, numbers, blocklists, technical patterns) |
| **Tier 2** | Small classifier (local) | Small LLM (GPT-4o-mini) — replaces ALL regex patterns |
| **Tier 3** | Topic novelty check only | Embedding search (pgvector + commitment ledger) — safety net |
| **Pattern libraries** | ~8 regex pattern files | REMOVED — replaced by Tier 2 LLM |
| **Commitment ledger** | YOU + THEM, basic | Full SpeakerIdentity, embeddings, Redis, entire meeting |
| **Alert categories** | 6-9 categories | 12 categories (added team_inconsistency, client_disengagement, undiscussed_agenda) |
| **Alert routing** | Single channel | Shared + personal channels per session |
| **Language support** | English only (regex) | Any language (LLM-based) |
| **New service** | None | Python voice embedding microservice |
| **Week 1** | Deepgram integration | Codebase migration + multi-user foundation |
| **Week 2** | State management | Voice embeddings + speaker identification |
| **Total duration** | 58 days (~6 weeks) | 68 days (~8 weeks) |

---

## Notes

- This timeline assumes 1 developer working full-time
- 68 working days = ~10 weeks at 7 days/week, or ~13.5 weeks with weekends
- Week 1 is primarily migration work (updating existing code to new architecture)
- Week 2 introduces the Python microservice — this is the biggest new dependency
- Pattern library work from the old timeline is completely removed (replaced by Tier 2 LLM)
- Week 7-8 can be parallelized if additional developer available
- Adjust based on actual velocity after Week 1
- No Chrome extension — desktop-first approach
- **Alert system with 12 categories is core differentiator — prioritize quality over speed**
- **Multi-user support is architecturally foundational — cannot be bolted on later**
- **Voice embedding accuracy is critical path — benchmark models early**
