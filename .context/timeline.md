# LARITY — DEVELOPMENT TIMELINE

**Reference Documents:**
- [architecture-and-flow.md](./architecture-and-flow.md) — System architecture (multi-user, remote server)
- [meeting-mode.md](./meeting-mode.md) — Meeting mode specification (VAD-correlation speaker ID, tiered LLM pipeline, 12 alert categories)
- [features.md](./features.md) — Complete feature list

---

## Product Shape (Non-Negotiable)

Before going into phases, align on what Larity actually is:

1. **Larity is a native desktop application (Tauri).** It is NOT a browser extension. There is no Chrome/Edge/Firefox extension and there will not be one. The desktop app is installed on every team member's machine and runs as a tray/overlay app.
2. **The desktop app captures a dual-channel audio feed from the host's machine**: host microphone on channel 0 and OS-level system audio loopback on channel 1, regardless of which conferencing tool is producing that audio (Zoom, Google Meet, Microsoft Teams, Discord, Slack Huddle, Jitsi, a dial-in phone bridged through the OS, etc.). No per-platform integrations are required, ever.
3. **A web app (`apps/web`) exists, but only as a dashboard / logs / settings surface** — history of past meetings, decisions, commitments, team / client / policy management, post-meeting review. The web app never captures audio and is not required during meetings.
4. **All real-time processing happens on a shared remote server** — see [architecture-and-flow.md](./architecture-and-flow.md). The desktop app is a thin client that streams audio up and renders ambient UI + alerts.
5. **Speaker identification is VAD-correlation based, not voice-embedding based.** No ML voice models, no Python microservice, no enrollment.

---

## Current State Assessment

### Completed

| Component | Status | Details |
|-----------|--------|---------|
| **packages/infra/redis** | Done | Client, pubsub, locks, TTL, keys, health checks |
| **packages/infra/rabbitmq** | Done | Connection, exchanges (ex.events, ex.jobs), queues (q.meeting.transcribe, q.meeting.summary), publish/consume with DLQ |
| **packages/infra/prisma** | Done | Full schema with all models (User, Meeting, MeetingParticipant, Transcript, etc.) |
| **apps/control** | Done | Elysia API with all routes, services, validators, auth middleware |
| **apps/realtime** | Done | uWebSockets.js server with session management, host audio frame ingestion, direct Deepgram relay, Redis state/control publishing |
| **packages/stt** | Done | Deepgram integration, session manager, Redis audio subscriber, utterance output |
| **packages/meeting-mode** | Done | Speaker identification, alerts system, topic state management, context assembler |

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
  diarizationIndices: { channel: 0 | 1; index: number }[]
  isCurrentUser: boolean
  confidence: number
}
```

**Files requiring changes:**

| File | What needs to change |
|------|---------------------|
| `packages/stt/src/types.ts:16` | `Speaker = "YOU" \| "THEM"` → remove type, `SttResult.speaker` → `SttResult.channel: number` + `SttResult.diarizationIndex: number` |
| `packages/stt/src/deepgram/connection.ts:177` | `speaker: this.currentSource === "mic" ? "YOU" : "THEM"` → use Deepgram channel index + diarization index instead |
| `packages/stt/src/deepgram/types.ts` | `DEFAULT_DG_CONFIG` needs `diarize: true`, `multichannel: true`, `channels: 2` added for the default host path |
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
| `packages/stt/src/deepgram/types.ts` | Add `diarize: true`, `multichannel: true`, `channels: 2` to `DEFAULT_DG_CONFIG` for dual-channel mode |
| `packages/stt/src/deepgram/types.ts` | `TranscriptResult` type needs to include speaker/diarization fields from Deepgram response |
| `packages/stt/src/deepgram/connection.ts` | Parse `channel_index` and `channel.alternatives[0].words[].speaker` from diarized results |
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
| `apps/control/src/validators/meeting-session.ts` | `startSessionSchema.metadata.audioSource` — simplify, host always sends dual-channel audio when capable; otherwise single-channel fallback |

#### 4. Prisma Schema Additions

New models needed:

| Model | Purpose |
|-------|---------|
| `Commitment` | Persist commitment ledger after meeting ends (linked to Meeting, speaker attribution) |

> **No `Voiceprint` model.** Speaker identification is VAD-correlation-based. The only per-user data needed for speaker ID at session start is the team roster (userId, name) — already present on `User`.

#### 5. Redis Key/Channel Additions

New keys needed for multi-user:

| Key Pattern | Purpose |
|-------------|---------|
| `meeting.session.{sessionId}.participants` | Track connected participants |
| `meeting.alert.{sessionId}.shared` | Shared alert channel (all team members) |
| `meeting.alert.{sessionId}.user.{userId}` | Personal alert channel (specific user) |
| `meeting.commitment.{sessionId}` | Commitment ledger (entire meeting) |
| `meeting.speaker.{sessionId}` | Speaker identification state (`channel:index` → identity) |

#### 6. Removed: Regex Pattern Libraries

The old timeline (Week 2, Day 12-13) planned for extensive regex pattern libraries:
- Risky language patterns
- Pressure tactic patterns
- Emotional indicator patterns
- Scope creep patterns
- Backtrack patterns
- Vague language patterns

**All of these are removed.** They are replaced by Tier 2 small LLM classification (Gemini flash-lite), which works in any language and catches semantic meaning that regex cannot.

Tier 1 is now **structural detection only** — dates, numbers, blocklist keywords, technical patterns (API keys, hashes). No English-specific regex.

---

## Realtime Server Details (Already Built)

The `apps/realtime` server is functional but needs multi-user updates:

```
Current Audio Flow:
Host desktop → WebSocket (binary frames) → onMessage handler → Deepgram session in same worker

Needs to become:
Host desktop Rust audio engine → WebSocket (dual-channel binary frames) → onMessage handler → Deepgram session in same worker
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
- Diarization + multichannel enabled (`diarize: true`, `multichannel: true`, `channels: 2`) for the default host path
- Channel index + diarization index parsing from Deepgram responses
- Removal of `source → speaker` identity mapping
- `SttResult` to carry `channel` + `diarizationIndex` instead of `Speaker`

### Not Started

- Speaker identification via VAD speaking signals (local mic VAD → WebSocket signal → server-side diarization correlation)
- Multi-user session join flow
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
- [x] Update `SttResult` in `packages/stt/src/types.ts` — replace `speaker: Speaker` with `channel: number` + `diarizationIndex: number`
- [x] Update `Utterance` in `packages/meeting-mode/src/utterance/types.ts` — replace `speaker: Speaker` with `speaker: SpeakerIdentity`
- [x] Update `RingBuffer.getBySpeaker()` → replaced with `getBySpeakerType()`, `getBySpeakerId()`, `getByUserId()`
- [x] Update `RingBuffer` format method — uses `speaker.name`
- [x] Update `UtteranceMerger.shouldMerge()` — compares `speakerId`
- [x] Update `UtteranceFinalizer` — uses `createUnidentifiedSpeaker(channel, diarizationIndex)`, defers identity to host-channel short-circuit or VAD correlation
- [x] Update `ContextAssembler` — filters by `speakerType`/`speakerId`/`userId`, renamed to `teamUtterances`/`externalUtterances`/`uniqueSpeakers`

**Deliverable:** All existing code compiles with new speaker model. No remaining `"YOU" | "THEM"` references. ✓

### Day 3-4: Deepgram Diarization Updates ✓ COMPLETEDBL2025260500484

**packages/stt**

- [x] Add `diarize: true` to `DEFAULT_DG_CONFIG` in `packages/stt/src/deepgram/types.ts`
- [ ] Add dual-channel Deepgram config for host default path: `multichannel: true`, `channels: 2`
- [x] Update `TranscriptResult` type to include diarization fields (`DeepgramWord` with `speaker?: number`)
- [x] Update `DeepgramConnection` — parse speaker index from `words[0].speaker`
- [ ] Update `DeepgramConnection` — parse and propagate `channel_index`
- [x] Remove `currentSource === "mic" ? "YOU" : "THEM"` logic in `connection.ts`
- [x] Emit `SttResult` with `diarizationIndex` instead of `speaker`
- [ ] Emit `SttResult` with `channel` for dual-channel mode
- [x] Test diarization output with multi-speaker audio (requires live Deepgram connection) — *Mock test implemented in `packages/stt/src/deepgram/connection.test.ts`*
- [x] Handle edge case: diarization not ready yet (first few seconds) — emit with `diarizationIndex: -1`

**Deliverable:** Deepgram emits utterances with speaker diarization indices, not binary YOU/THEM. ✓

### Day 5-6: Multi-User Session Model ✓ COMPLETED

**apps/realtime + apps/control**

- [x] Update `apps/realtime/src/session.ts` — support multiple connections per meeting session:
  ```ts
  interface SessionConnection {
    userId: string
    role: "host" | "participant"
    socket: WebSocket
    connectedAt: number
  }
  // Map<sessionId, SessionConnection[]>
  ```
- [x] Update `on-upgrade` handler — validate user identity and role from auth token/query params (handled in `server.ts` beforeHandle)
- [x] Update `on-message` handler — only accept audio frames from host connections
- [x] Update `on-close` handler — distinguish host disconnect (ends session) from participant disconnect (just leaves)
- [x] Add broadcast mechanism — send processed utterances/alerts to all session connections (`redis/subscriber.ts`)
- [x] Update `apps/control/src/services/meeting-session.service.ts`:
  - [x] Expand `SessionData` with `hostUserId`, `participants[]`, `orgId`, `clientId` (via Redis sets)
  - [x] Add `join()` method for team members
  - [x] Add participant tracking in Redis
- [x] Add `POST /meeting-session/join` endpoint to control API
- [x] Add `GET /meeting-session/:id/participants` endpoint (implicit via session status or join response)
- [x] Update `startSessionSchema` validator — host always sends audio from the desktop app; platform and capture mode are metadata only

**Deliverable:** Multiple team members can join a shared meeting session. Host sends audio, participants receive results. ✓

### Day 7: Redis Channels & Alert Routing Infrastructure ✓ COMPLETED

**packages/infra/redis + packages/meeting-mode**

- [x] Add new Redis key patterns to `packages/infra/redis/keys.ts`:
  - [x] `meeting.alert.{sessionId}.shared`
  - [x] `meeting.alert.{sessionId}.user.{userId}`
  - [x] `meeting.commitment.{sessionId}`
  - [x] `meeting.speaker.{sessionId}`
  - [x] `meeting.utterance.{sessionId}`
  - [x] `meeting.topic.{sessionId}`
- [x] Add new TTL constants to `packages/infra/redis/ttl.ts`:
  - [x] `ALERT_SHARED: 1800`
  - [x] `ALERT_PERSONAL: 1800`
  - [x] `COMMITMENT_LEDGER: 7200`
  - [x] `SPEAKER_STATE: 7200`
- [x] Implement alert types (`packages/meeting-mode/src/alerts/types.ts`):
  - [x] All 12 `AlertCategory` values
  - [x] `Alert` interface with routing, severity, speaker identity
  - [x] `ALERT_PRIORITY` ordering (policy_violation=1 → undiscussed_agenda=12)
  - [x] `ALERT_UX_RULES` (max 2 visible, display durations, debounce window)
  - [x] `createAlert()` factory helper
  - [x] `getAlertExpiryMs()` severity-based expiry
- [x] Implement alert router (`packages/meeting-mode/src/alerts/router.ts`):
  - [x] `resolveAlertRouting()` — personal-when-own, shared-when-team, both for info_risk/policy_violation
  - [x] `resolveTargetUserId()` — extracts target for personal/both routing
  - [x] `resolveFullRouting()` — combined routing + targetUserId
- [x] Implement alert publisher (`packages/meeting-mode/src/alerts/publisher.ts`):
  - [x] Routes shared alerts to `meeting.alert.{sessionId}.shared`
  - [x] Routes personal alerts to `meeting.alert.{sessionId}.user.{userId}`
  - [x] Routes both alerts to both channels simultaneously
  - [x] Error handling: fail-silent, logs errors
- [x] Implement alert subscriber (`packages/meeting-mode/src/alerts/subscriber.ts`):
  - [x] Subscribes to shared + own personal channel per session
  - [x] Parses incoming alert JSON messages
  - [x] Callbacks: `onSharedAlert`, `onPersonalAlert`
  - [x] Cleanup: `stop()` with Redis quit
- [x] Implement alert queue manager (`packages/meeting-mode/src/alerts/queue.ts`):
  - [x] Max 2 visible alerts (configurable)
  - [x] Priority-ordered pending queue (lower priority number = higher priority)
  - [x] Priority eviction: higher priority alerts evict lowest-priority active
  - [x] Deduplication: same category + topic within debounce window (5s)
  - [x] Recently-shown tracking (60s window)
  - [x] Auto-expiry by severity (10-30s)
  - [x] Dismiss with promotion from pending
- [x] Update `packages/meeting-mode/src/channels.ts`:
  - [x] `sharedAlertChannel()`, `personalAlertChannel()`, `topicChannel()`, `commitmentChannel()`, `speakerChannel()`, `audioChannel()`
  - [x] `extractSessionId()` handles all channel formats
  - [x] `extractUserIdFromAlertChannel()` for personal channel parsing
  - [x] Pattern constants: `ALERT_SHARED_PATTERN`, `ALERT_PERSONAL_PATTERN`
- [x] Unit tests (128 test cases across 5 test files, using `bun:test`):
  - [x] `tests/alerts/types.test.ts` — ALERT_PRIORITY, ALERT_UX_RULES, createAlert, getAlertExpiryMs
  - [x] `tests/alerts/router.test.ts` — all 12 categories with own/team/external speaker, resolveFullRouting
  - [x] `tests/alerts/publisher.test.ts` — shared/personal/both channel routing, missing targetUserId, error handling
  - [x] `tests/alerts/subscriber.test.ts` — channel key generation, sessionId/userId extraction, message parsing
  - [x] `tests/alerts/queue.test.ts` — enqueue/display, eviction, dedup, dismiss, auto-expiry, priority ordering
- [x] Integration test (`tests/alerts/alert-routing.integration.test.ts`):
  - [x] Full Router → Publisher → Queue pipeline
  - [x] All 12 categories verified for valid routing
  - [x] Redis key consistency between `redisKeys` and `channels`
  - [x] TTL values verified for alert/commitment/speaker keys

**Deliverable:** Redis infrastructure supports shared and personal alert channels for multi-user sessions. ✓

---

## Week 2: Speaker Identification + OS-Level Audio Capture

**Goal (two tracks):**
1. Implement VAD-based speaker identification (no voice embeddings, no voiceprints) and wire the full audio → identified utterance pipeline (Day 8-11).
2. Land dual-channel host audio intake in the Tauri desktop app's Rust layer across Windows / macOS / Linux, plus meeting-detection prompts (Day 12-14). This is the product's single biggest platform-specific workstream and is the reason Larity can claim to work with any conferencing tool.

### Day 8-9: VAD Speaking Signals & Server-Side Diarization Correlation

> **Decision:** Voice embedding (sherpa-onnx / voiceprints) is eliminated entirely. Since all team members run Larity on their own machines, local VAD on each member's mic provides a reliable, zero-enrollment, platform-agnostic way to identify which channel-1 diarization index belongs to which non-host team member. The host is identified directly from channel 0 in dual-channel mode. Works on Zoom, Meet, Teams, or any platform since the audio capture is OS-level.

#### Day 8: VAD in Tauri Desktop App ✓ COMPLETED

**apps/desktop**

- [x] Implement continuous local VAD on the team member's microphone (not system audio — their own mic only)
  - [x] Use `@ricky0123/vad-web` (ONNX-based Silero VAD, works in Node/Tauri) or WebRTC energy-based VAD
  - [x] VAD runs on the local mic stream only — detects when THIS user is speaking
  - [x] Emit `speakingStart` and `speakingEnd` events with precise ms timestamps
- [x] Wire VAD events to the existing WebSocket session connection:
  - [x] On `speakingStart`: send `{ type: "vad_speaking", userId, sessionId, ts }`
  - [x] On `speakingEnd`: send `{ type: "vad_silence", userId, sessionId, ts }`
  - [ ] Replace `Date.now()` timestamps with monotonic `performance.now()`-derived timestamps (or Rust `Instant` once VAD moves Rust-side)
- [x] Handle edge cases:
  - [x] Mic not available or permission denied → log warning, VAD disabled for this session
  - [x] User muted in the meeting platform → VAD still fires from mic (this is fine — muted means their audio isn't in the system stream, so no diarization index will be active at that timestamp)

**Deliverable (Day 8):** Desktop app sends VAD speaking signals via WebSocket during sessions.

#### Day 9: Server-Side Diarization Correlation ✓ COMPLETED

**apps/realtime + packages/meeting-mode (new module: speaker-identification)**

- [x] Receive and buffer VAD signals from all session participants:
  ```ts
  interface VadSignal {
    userId: string
    sessionId: string
    ts: number         // ms timestamp from client clock
    type: "speaking" | "silence"
  }

  // Per-session VAD state: who is speaking right now
  type VadState = Map<string, { isSpeaking: boolean; startTs: number }>
  ```
- [x] Implement diarization correlation on the server:
  - [x] On each Deepgram diarized word/utterance: check which team member's VAD was active at `word.startTime`
  - [ ] On channel 0 in dual-channel mode: assign host identity directly without VAD correlation
  - [x] Use a ±300ms correlation window to account for clock drift and audio pipeline delay between mic and system audio
  - [x] If exactly one team member overlaps → assign: `channel + diarizationIndex → TEAM (userId)`
  - [x] If multiple overlap (simultaneous speech) → ambiguous, defer, accumulate more signals
  - [x] If no team member overlaps → `diarizationIndex → EXTERNAL`
- [x] Build `SpeakerIdentifier` class (in `packages/meeting-mode/src/speaker-identification/`):
  ```ts
  class SpeakerIdentifier {
    // channel:index → identified SpeakerIdentity (cached once confirmed)
    private identifiedSpeakers: Map<string, SpeakerIdentity>
    // Buffered utterances awaiting identity (default EXTERNAL until confirmed)
    private pendingBuffer: Map<number, Utterance[]>
    // Recent VAD signals with timestamps (rolling ~2s window)
    private vadState: VadState
  }
  ```
- [x] Implement identification flow:
  1. VAD signal arrives → update `vadState`
  2. Utterance arrives with `channel` and `diarizationIndex`
  3. If index already in `identifiedSpeakers` cache → emit immediately with cached identity
  4. If channel is 0 in dual-channel mode → assign host immediately; otherwise correlate against `vadState` at utterance timestamp
  5. If match → assign TEAM identity, cache, flush pending buffer for this index
  6. If no match → emit as EXTERNAL (conservative default), buffer for potential retroactive update
- [x] Implement retroactive reprocessing:
  - [x] When correlation arrives late (VAD signal after utterance) → re-emit buffered utterances with corrected identity
  - [x] Late correlation window: accept VAD signals up to 2s after an utterance was emitted
- [x] Persist speaker mapping to Redis (`meeting.speaker.{sessionId}`) so participants who join mid-meeting get current state
- [x] Benchmark: VAD correlation should resolve within **<50ms** of utterance finalization for actively speaking team members

**Deliverable (Day 9):** Server correctly maps diarization indices to team member identities via VAD correlation. EXTERNAL speakers identified by exclusion. ✓

### Day 10-11: Speaker Identity Integration & Correlation Hardening

**packages/stt + packages/meeting-mode + apps/realtime**

> **Architectural additions on top of Day 8-9's working VAD correlation:** clock-offset reconciliation (B.5) and diarization-index reassignment-merge (B.4). These are the two failure modes that break naive VAD correlation in production. See [meeting-mode.md §3.3.1 and §3.3.2](./meeting-mode.md#331-clock-offset-reconciliation).

- [x] Wire full pipeline: Audio → Deepgram (diarized) → `SttResult` (with `diarizationIndex`) → `SpeakerIdentifier` → `Utterance` (with `SpeakerIdentity`)
- [ ] Extend full pipeline for dual-channel mode: `SttResult.channel` → `SpeakerIdentifier` host-channel short-circuit → `Utterance.channel`
- [x] Update `UtteranceFinalizer`: emit utterance immediately with current identity (EXTERNAL if not yet identified), do not block on identification
- [x] Handle retroactive identity updates: when a diarization index gets identified after utterances were already emitted → re-emit corrected utterances to all subscribers
- [x] Broadcast all identified utterances to session participants via Redis (`meeting.utterance.{sessionId}`)
- [x] Update `apps/realtime` to forward VAD signals from clients to the `SpeakerIdentifier`
- [x] **Per-client clock-offset reconciliation (B.5):**
  - [x] Every client message carries a monotonic `ts` (`performance.now`-derived)
  - [x] Server computes `sampleOffset = serverReceiveTs - clientSendTs - halfRTT` on each message (heartbeat + VAD)
  - [x] Maintain rolling median (last 30 samples) per userId per session — **median, not mean** — robust to jitter spikes
  - [x] Apply offset to VAD timestamps before correlation: `adjustedTs = vadEvent.ts + clientOffset`
  - [x] Tighten correlation window to ±250ms (from ±300ms) now that drift is corrected, not tolerated
  - [x] If offset median shifts >500ms within a short window (likely sleep/resume), mark recent VAD untrusted for ~2s and defer assignment in that gap
- [x] **Diarization index reassignment-merge (B.4):**
  - [x] Change `SpeakerIdentity.diarizationIndex` (single) → `SpeakerIdentity.diarizationIndices: Set<number>`
  - [ ] Change `SpeakerIdentity.diarizationIndices` to channel-aware pairs: `{ channel: 0 | 1; index: number }[]`
  - [x] Restructure cache from `Map<diarizationIndex, SpeakerIdentity>` to `Map<diarizationIndex, speakerId>` → `Map<speakerId, SpeakerIdentity>` (single-channel baseline)
  - [ ] Restructure cache key to `Map<channel:index, speakerId>` for dual-channel mode
  - [x] On a new, unseen diarization index: run VAD correlation → candidate userId; if an existing SpeakerIdentity has the same userId AND gap since its `lastUtteranceTs` > 15s, **merge** (add the new index to the existing identity's set)
  - [x] Do not emit a "new speaker" event for merged indices
  - [x] If gap < 15s and correlation conflicts → genuinely a different speaker → new SpeakerIdentity
- [x] End-to-end integration test: 3-person simulated session (2 TEAM + 1 EXTERNAL) → correct TEAM/EXTERNAL attribution
- [x] Test retroactive identification: utterance emitted as EXTERNAL, VAD signal arrives 500ms later, re-emit as TEAM
- [x] Test simultaneous speech: two team members speak at the same time → both remain EXTERNAL until correlation is unambiguous
- [x] Test diarization reassignment: induce a 30s silence in the fixture, verify that the post-silence `speaker=N+1` maps back onto the same `speakerId` as pre-silence `speaker=N` for the same talker
- [x] Test clock drift: fixture with +2s artificial client skew → offset correction keeps correlation accuracy ≥ target (no regression vs zero-skew)

**Deliverable:** Complete audio → identified utterance pipeline working end-to-end. TEAM members identified via VAD within one utterance of speaking. ✓

### Day 12-13: Dual-Channel OS-Level Audio Capture (Tauri / Rust) — PARTIAL

> **Why this phase exists:** Larity is a native desktop app. The host's Larity instance must capture host mic + OS-level loopback audio of the system mixer so it works identically regardless of which conferencing app (Zoom, Meet, Teams, Discord, Slack Huddle, dial-in SIP app, etc.) is producing the meeting audio. The mic channel gives clean host speech and deterministic host identity; the loopback channel keeps platform-agnostic remote audio intake. This is the single biggest platform-specific workstream in the whole product and must not be deferred to "Week 6 frontend" where it was previously hidden as a one-line "audio capture hook".

**apps/desktop (Rust / Tauri side — `src-tauri`)**

- [x] Add Rust crates for audio capture:
  - [x] `cpal` (cross-platform baseline) with feature flags where possible
  - [x] Host mic capture via `cpal`
  - [ ] Windows: implement true WASAPI loopback on the default render device (`wasapi-rs` or cpal loopback-capable path)
  - [ ] macOS: implement **ScreenCaptureKit audio-only** (macOS 13+, no kext, no virtual device). Fallback path: instruct user to install a virtual audio device (BlackHole / Loopback) and record it as an input device via `cpal`
  - [x] Linux: PipeWire / PulseAudio `.monitor` source of default sink via `parec` / PipeWire-Pulse bridge
- [x] Define Tauri commands (exposed from Rust to the React frontend):
  - [x] `audio_capture_list_devices()` → enumerate candidate loopback sources
  - [x] `audio_capture_start(sessionId, deviceOverride?)` → start current capture path
  - [ ] `audio_capture_start(sessionId, micDeviceId?, loopbackDeviceId?, role)` → host starts dual-channel capture; participants start VAD/control only
  - [x] `audio_capture_stop()` → stop capture cleanly
  - [x] `audio_capture_status()` → current state + per-platform backend in use + any permission errors
- [ ] Frame format: 16 kHz **2-channel** interleaved 16-bit PCM (host mic ch0, system loopback ch1), 50 ms frames, aligned by sample counter and tagged with monotonic timestamp. Deepgram accepts this directly with `multichannel=true`.
- [x] Current fallback frame format: 16 kHz mono 16-bit PCM, 50 ms frames.
- [x] Handle OS permission prompts:
  - [x] macOS: request screen-recording permission (SCK) once, surface failure gracefully
  - [x] Windows: no extra permission for WASAPI loopback
  - [x] Linux: detect PipeWire vs PulseAudio vs neither; guide user if neither is present
- [x] Fail-silent: if capture cannot start, the desktop app surfaces a clear error modal but **does not crash the session** for other participants — the host just can't be a host on this machine right now
- [ ] Unit tests in Rust for dual-channel frame sizing, sample-counter alignment, resampling, and state machine (start → running → stop)
- [ ] Move resampling and PCM encoding off the cpal real-time callback into a worker/ring-buffer path
- [ ] Add clipping-safe handling: no client-side summing in dual-channel mode; if single-channel fallback ever mixes, use soft limiter or <=0.5 gain per source

**Deliverable (Day 12-13):** Prototype host capture exists, with Linux loopback functional and the intended dual-channel shape specified. Production dual-channel correctness (Rust-native WebSocket transport, true Windows/macOS loopback, channel-aware STT schema, and Rust-side VAD cleanup) is completed in the Post-Day 23 patch below.

### Day 14: Meeting Detection & Desktop App Wiring ✓ COMPLETED

**apps/desktop (React + Rust sides)**

- [x] Meeting-detection signals (all are *prompts*, never auto-start):
  - [x] **Manual start:** Always available via tray icon or overlay button
- [ ] Wire Rust-native audio streaming:
  - [ ] Open the realtime WebSocket from Rust for host PCM frames
  - [ ] Send binary PCM frames directly from Rust (no Tauri event bridge, no base64, no JS `atob` decode)
  - [ ] Keep JS/React responsible for UI state, warnings, and control messages only
  - [ ] Back-pressure handling in Rust: bounded queue, drop oldest with metrics, surface a heartbeat warning
- [x] Current fallback frontend audio streaming:
  - [x] Subscribe to the Rust `audio-frame` Tauri event
  - [x] Push each frame as a binary WebSocket message to `apps/realtime`
  - [x] Back-pressure handling: if WS buffer grows past threshold, drop oldest frame + surface a heartbeat warning
- [x] **Server-side audio path is direct, not via Redis (B.2):**
  - [x] `apps/realtime` receives each binary frame and pipes it **straight into the per-session Deepgram WebSocket** owned by the same worker process
  - [x] No Redis `XADD` / stream / pubsub on audio bytes — Redis is reserved for state, control, and alerts
  - [x] Audio is exactly one-producer (host WS) → one-consumer (Deepgram WS); fan-out is not required, so a Redis hop would be pure latency with no value
  - [x] Session affinity is enforced at the load balancer / reverse proxy (sticky by `sessionId`) so the host's WS always lands on the worker that holds that session's Deepgram connection
- [x] Document this invariant in `apps/realtime/README.md` so no one "helpfully" routes audio through Redis later
- [ ] Integration test: fake conferencing app + host mic fixture → host starts session → dual-channel frames reach realtime server → Deepgram returns channel-indexed diarized transcript
- [x] Current fallback integration test: fake audio → host starts session → frames reach realtime server → Deepgram returns diarized transcript

> **Note:** Calendar trigger and process/audio-activity heuristic (optional features) are not yet implemented.

**Deliverable (Day 14):** Desktop app can be launched, detect or be told about a meeting, start the prototype host capture path, stream to the remote server, and appear in the server's session registry. Production dual-channel intake is intentionally scheduled after Day 22-23 so Tier 3+ work builds on the final utterance shape.

#### Post-Day 14 Patch: Desktop Realtime Identity Inputs ✓ COMPLETED

**apps/desktop**

- [x] Add host identity override in desktop UI (`Realtime User ID (host)`) so websocket auth can target real control-created sessions
- [x] Add env-based identity/session bootstrap (`VITE_WS_USER_ID`, `VITE_SESSION_ID`)
- [x] Harden websocket UX with better close/error warning messaging for authorization/validation failures
- [x] Add helper tests for realtime socket URL construction and dynamic identity updates
- [x] Document realtime env variables and UUID-session caveat in `apps/desktop/README.md`

**Deliverable:** Desktop app can connect to strict-validated UUID meeting sessions by using the correct host user ID instead of relying on validation-bypass session IDs.

---

## Week 3: State Management & New Tier System

**Goal:** Build the three memory layers, new tier system (pre-filter → structural → small LLM → embeddings), and commitment ledger.

### Day 15-16: Topic State Management ✓ COMPLETED

**packages/meeting-mode**

- [x] Define `TopicState` interface (per meeting-mode.md spec, including completeness tracking)
- [x] Integrate embedding model (`@google/genai` SDK for Gemini models, replacing OpenAI `text-embedding-3-small` for cost/consistency)
- [x] Implement topic centroid calculation and comparison
- [x] Build topic assignment logic (similarity threshold)
- [x] Implement rolling topic summary state with debounced LLM refinement
- [x] Add topic state persistence in Redis (per session)
- [x] Publish topic change events to Redis (`meeting.topic.{sessionId}`)
- [x] Broadcast topic changes to all connected participants
- [x] Address test failures in pipeline and finalizer tests by mocking `GoogleGenAIEmbedder`, `TopicSummarizer`, and narrowing `UtterancePublisher` tracking.

**Deliverable:** Utterances are assigned to semantic topics that persist across the meeting via Redis, using Gemini embeddings and debounced summary refinement. ✓

### Day 17-18: Commitment Ledger (In-Memory HNSW + Redis Snapshot) ✓ COMPLETED

**packages/meeting-mode**

> **Architectural note:** The ledger is **not** stored in plain Redis as a keyed list. The primary index is an **in-process HNSW** per session (sub-ms top-K search, zero network cost). Redis holds a JSON snapshot for crash recovery, observer fan-out, and post-meeting handoff. See [meeting-mode.md §5.4.2](./meeting-mode.md#542-commitment-ledger-in-memory-hnsw--redis-snapshot-entire-meeting).

- [x] Define `Commitment` interface with `SpeakerIdentity` (per meeting-mode.md):
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
- [x] Primary index: in-memory vector index per session
  - [x] Integrate vector index (BruteForceCommitmentVectorIndex for development)
  - [x] Index key: commitment id; value: embedding vector
  - [x] Parallel in-memory `Map<id, Commitment>` for metadata lookup
  - [x] Top-K search API: `searchLedger(sessionId, embedding, k) → Commitment[]`
- [x] Secondary: Redis snapshot (`meeting:ledger:{sessionId}`)
  - [x] JSON serialization of the commitment map, written through on every insert and status change
  - [x] Embeddings stored as base64-packed Float32 so a replacement worker can rehydrate without re-embedding
  - [x] Pub/sub channel `meeting.ledger.{sessionId}` fires on insert and status change (for observers: post-meeting worker, dashboard)
- [x] Crash-recovery path: on worker restart / failover, hydrate in-memory index from the Redis snapshot before accepting new utterances
- [x] Implement cross-speaker search: find commitments from OTHER speakers on same topic/type
- [x] Implement status evolution logic (tentative → confirmed → contradicted → superseded)
- [x] Add relationship tracking (contradiction, supersession, confirmation)
- [x] Wire: Tier 2 writes commitments to ledger (HNSW + snapshot); Tier 3 searches HNSW (hot path, sub-ms)
- [x] Drop path: on graceful meeting end, hand snapshot to post-meeting worker → persist to pgvector → delete in-memory index + Redis snapshot

**Deliverable:** Commitment ledger tracks all commitments with embeddings across the entire meeting, searchable for contradiction detection in sub-ms without leaving the realtime worker's address space, with a Redis snapshot for durability and observation. ✓

### Day 19-20: Constraint Ledger + Context Preload ✓ COMPLETED

**packages/meeting-mode + apps/control**

- [x] Define `Constraint` interface with `SpeakerIdentity`:
  ```ts
  interface Constraint {
    id: string
    type: "date" | "capacity" | "policy" | "dependency" | "legal"
    value: string
    source: "preloaded" | "meeting"
    utteranceId?: string
    speaker?: SpeakerIdentity
    confidence: number
    topicIds: string[]
  }
  ```
- [x] Implement constraint ledger (`packages/meeting-mode/src/constraint/ledger.ts`):
  - [x] In-memory Map with normalized value index for fast lookup
  - [x] Redis snapshot persistence (`meeting:constraint:{sessionId}`)
  - [x] Pub/sub event emission on insert (`meeting.constraint.{sessionId}`)
  - [x] Delta comparison: merge duplicate constraints by type + normalized value
- [x] Implement constraint manager (`packages/meeting-mode/src/constraint/manager.ts`):
  - [x] Hydrate from Redis snapshot on session reconnect
  - [x] Hydrate from preloaded context payload
  - [x] Structural detection from utterances (dates, %, capacity, policy, dependency)
  - [x] Insert/skip result with duplicate detection
- [x] Wire constraint manager into meeting-mode pipeline:
  - [x] `UtteranceFinalizer.onUtterancePublished` hook triggers constraint detection
  - [x] `startSubscriber` hydrates sessions on first STT result
- [x] Implement context preload on session start (`apps/control/src/services/meeting-session.service.ts`):
  - [x] Open decisions (client-scoped, last 84 days)
  - [x] Known constraints (`ImportantPoint.category === "CONSTRAINT"`)
  - [x] Active policy guardrails (org-wide, `isActive: true`)
  - [x] Prior commitments (`ImportantPoint.category === "COMMITMENT"`)
  - [x] Client name list (client + client members for Tier 1 blocklist)
  - [x] Org-configured keyword blocklists (recursive extraction from `org.settings`)
  - [x] Calendar agenda items (parsed from meeting agenda)
  - [x] Context payload stored in Redis (`meeting:context:{sessionId}`) with appropriate TTL
  - [x] Cleanup shortens context TTL on session end
- [x] Add Redis keys (`packages/infra/redis/keys.ts`):
  - [x] `meetingConstraintLedger: (sessionId) => "meeting:constraint:${sessionId}"`
  - [x] `meetingContext: (sessionId) => "meeting:context:${sessionId}"`
- [x] Add TTL constants (`packages/infra/redis/ttl.ts`):
  - [x] `CONSTRAINT_LEDGER: 7200`
  - [x] `MEETING_CONTEXT: 14400`
- [x] Add constraint channel (`packages/meeting-mode/src/channels.ts`):
  - [x] `constraintChannel(sessionId) => "meeting.constraint.${sessionId}"`
  - [x] Add "constraint" to `meetingSessionChannels` for session ID extraction
- [x] Unit and integration tests:
  - [x] `tests/constraint/ledger.test.ts` — insert, snapshot, pubsub, delta merge
  - [x] `tests/constraint/manager.test.ts` — hydration, structural detection, dedup
  - [x] `tests/constraint/constraint-pipeline.integration.test.ts` — end-to-end flow
  - [x] `apps/control/src/services/meeting-session.service.test.ts` — preload assertions
  - [x] `tests/alerts/subscriber.test.ts` — constraint channel session extraction

**Deliverable:** Constraint tracking and context preloading operational with structural detection (dates, %, capacity, policy, dependency) and Redis-backed persistence. ✓

### Day 21: Pre-filter & Tier 1 — Structural Detection

**packages/meeting-mode**

- [x] **Pre-filter implementation (Free, <10ms):**
  - [x] Less than 3 words → DROP
  - [x] Pure acknowledgment detection ("ok", "yeah", "mm-hmm", "right", "haan", "theek hai") → DROP
  - [x] Exact/near-duplicate of recent utterance → DROP
  - [x] Target: kill ~30-40% of utterances

- [x] **Tier 1: Structural Detection (Free, <50ms):**
  - [x] Date/time extraction (number/calendar format parsing — language-agnostic)
  - [x] Number extraction ($, %, quantities — structural patterns)
  - [x] Org-configured keyword blocklist matching (exact + fuzzy)
  - [x] Technical pattern detection (API keys, SSH keys, long hashes, credentials)
  - [x] Client name matching from preloaded list
  - [x] **Tier 1 is an accelerator, NOT a gate** — fires instant alerts but everything passes through to Tier 2

**Deliverable:** Pre-filter kills noise, Tier 1 catches structural patterns instantly. No regex pattern libraries for semantic detection.

---

## Week 4: LLM-Based Classification & Embedding Search

**Goal:** Build Tier 2 (small LLM), Tier 3 (embedding search), and Tier 4 (deep reasoning).

### Day 22-23: Tier 2 — Small LLM Classification

**packages/meeting-mode**

- [x] Set up direct Gemini integration (`@google/genai`) for small LLM (`gemini-3.1-flash-lite-preview`)
- [x] Define Tier 2 input schema:
  ```ts
  interface Tier2Input {
    utterance: string
    speaker: SpeakerIdentity
    recentSameSpeaker: string[]    // Last 2-3 utterances from same speaker
    topicLabel?: string
  }
  ```
- [x] Define Tier 2 output schema (Zod-enforced):
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
    topicDelta?: {
      labelHint?: string
      decision?: string
      commitment?: string
      openQuestion?: string
      risk?: string
      owner?: string
      deadline?: string
    }
  }
  ```
- [x] Build LLM prompt template for classification (multilingual, semantic)
- [x] Implement cross-utterance context (fetch last 2-3 from same speaker from ring buffer)
- [x] Make Tier 2 the single per-utterance semantic source for both alerting and topic-state updates (no duplicate semantic extraction in topic summarizer)
- [x] Update topic state reducer to consume `Tier2Classification.topicDelta` and maintain deterministic live summaries without an extra per-utterance LLM call
- [x] Implement gate logic:
  - [x] `filler`/`general` + no risk signals + confidence > 0.8 → STOP (don't proceed to Tier 4)
  - [x] `commitment`/`decision` → write to commitment ledger immediately (with shared embedding)
  - [x] Everything continues to Tier 3 regardless
- [x] Add response validation and timeout (200ms max, fail-silent)
- [x] Test with multilingual utterances (English, Hindi, Hinglish)

**Deliverable:** Every utterance is classified by small LLM as the single semantic source of truth (alerts + topic deltas) — replaces ALL old regex pattern libraries. Works in any language.

### Post-Day 23 Patch: Dual-Channel Audio Intake Hardening — REQUIRED BEFORE DAY 24

**apps/desktop + apps/realtime + packages/stt + packages/meeting-mode**

> This patch is applied immediately after the current completed Day 22-23 work, before Tier 3 begins. It turns the prototype intake into the production intake described in `meeting-mode.md`: host mic on ch0, system loopback on ch1, direct Rust-to-realtime WebSocket, channel-aware utterances, and host identity assigned by channel. Doing this now prevents Tier 3, Tier 4, and observability work from being built on the old mono/JS-relay assumptions.

- [ ] **Rust audio transport:**
  - [ ] Add Rust WebSocket client for host PCM frames (`tokio-tungstenite` or equivalent)
  - [ ] Remove the hot-path Rust → Tauri event → JS → WebSocket PCM relay from production mode
  - [ ] Keep a dev fallback flag for the current JS relay while the Rust socket is being stabilized
  - [ ] Add per-session upload metrics: frames sent, frames dropped before WS, WS buffered bytes, last frame timestamp
- [ ] **Dual-channel frame builder:**
  - [ ] Maintain separate mic and loopback sample counters
  - [ ] Align frames by sample counter, not `SystemTime::now()` callback time
  - [ ] Interleave `i16` samples as `[mic0, sys0, mic1, sys1, ...]`
  - [ ] Send 50 ms frames: 800 samples/channel, 1600 samples total, 3200 bytes/frame
  - [ ] If one stream fails, emit single-channel fallback and set `multichannel=false` for Deepgram
- [ ] **Platform capture correctness:**
  - [ ] Linux: keep `parec @DEFAULT_MONITOR@` path, but expose PipeWire/Pulse error status
  - [ ] Windows: replace current output-device `build_input_stream` fallback with real WASAPI loopback
  - [ ] macOS: wire ScreenCaptureKit / Core Audio process tap; remove unused dependency if not implemented in this patch
- [ ] **Rust-side VAD cleanup:**
  - [ ] Run VAD on the mic samples already captured by Rust
  - [ ] Emit VAD edge events with a monotonic timestamp derived from `Instant`
  - [ ] Stop opening the microphone a second time from `@ricky0123/vad-web` in production mode
  - [ ] Keep web VAD only as a fallback for platforms where Rust VAD is disabled
- [ ] **STT + utterance schema:**
  - [ ] Add `multichannel` and `channels` config to Deepgram connection
  - [ ] Parse Deepgram `channel_index` and propagate it in `SttResult`
  - [ ] Add `channel` to `Utterance`
  - [ ] Change speaker cache key to `channel:index`
  - [ ] Host channel short-circuit: `channel === 0` maps to `hostUserId` immediately
  - [ ] VAD correlation runs on `channel === 1` only
- [ ] **Cost + observability:**
  - [ ] Include Deepgram channel-minute cost in the per-meeting cost rollup
  - [ ] Update budget expectation from `~$0.30` LLM-only to `~$1.22` dual-channel all-in nominal
  - [ ] Add per-utterance metrics fields: `channel`, `diarizationIndex`, `speakerCacheHit`, `hostChannelShortCircuit`
- [ ] **Tests:**
  - [ ] Unit test dual-channel interleaving and single-channel fallback
  - [ ] Unit test speaker cache keying by `channel:index`
  - [ ] Integration test: host ch0 utterance → TEAM host identity without VAD
  - [ ] Integration test: remote TEAM utterance on ch1 → VAD correlation → TEAM identity
  - [ ] Integration test: EXTERNAL utterance on ch1 with no VAD → EXTERNAL

**Deliverable:** Production audio intake matches the spec before Tier 3/Tier 4 build on it: lower latency, no base64/IPC hot path, no client-side mixing distortion, host identity is deterministic, and channel-aware utterances still feed the existing ring buffer, topic, commitment, and alert context mechanisms unchanged.

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
- [ ] Generate one shared embedding per utterance and reuse it for:
  - [ ] Tier 3 novelty/memory/ledger search
  - [ ] Tier 2 semantic-cache keying (embedding similarity)
  - [ ] Topic centroid assignment (via TopicManager)
  - [ ] Commitment ledger inserts (avoid re-embedding on write)
- [ ] Implement forcing logic:
  - [ ] Memory match found → force Tier 4
  - [ ] Commitment ledger match found (potential contradiction) → force Tier 4
  - [ ] No matches + Tier 2 said stop → STOP
- [ ] Optimize: batch embedding generation, connection pooling for pgvector, and eliminate duplicate embedding calls between topic assignment and Tier 3
- [ ] Target latency: <100ms total for all three checks

**Deliverable:** Tier 3 catches conflicts with organizational memory and intra-meeting contradictions that Tier 2 might miss.

### Day 26-27: Tier 4 — Deep LLM Reasoning

**packages/meeting-mode**

- [ ] Set up large LLM integration (Gemini Pro/Flash)
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
- [ ] Implement streaming LLM response handling **internally** to reduce TTFB — but emit exactly one atomic alert per call (no progressive / preliminary alerts surfaced to the UI; see B.8 and [meeting-mode.md §5.9](./meeting-mode.md#59-live-llm-invocation-non-streaming-atomic-alerts))
- [ ] Implement timeout (500ms max) and fail-silent logic
- [ ] Add response validation and schema enforcement

**Deliverable:** Tier 4 can reason about contradictions, risks, and conflicts and generate structured alerts with routing.

### Day 28: Parallel Pipeline Orchestration, Semantic Cache, Cost Caps, Observability

**packages/meeting-mode + apps/realtime**

> **Architectural anchor:** This is where the realtime pipeline hits its <800ms end-to-end budget. Key design points, all per [meeting-mode.md §5.6.1](./meeting-mode.md#561-pipeline-orchestration--parallel-tier-execution):
> - Tiers 1, 2, 3 run in parallel (independent inputs)
> - Tier 4 is gated by the combined output
> - Topic summary generation is off the hot path and derived from Tier 2 outputs
> - Tier 2 has a per-session semantic cache
> - Tier 4 invocations respect a per-meeting cost ceiling
> - Every stage emits structured latency/cost metrics

- [ ] **Parallel tier orchestration (B.1):**
  - [ ] Replace any sequential `await tier1; await tier2; await tier3;` with `const [t1, t2, t3] = await Promise.all([runTier1, runTier2, runTier3])`
  - [ ] Tier 2 commitment writes awaited *inside* the Tier 2 task, so Tier 3's ledger search sees prior commitments but not the current one
  - [ ] Tier 1 instant alerts (blocklist/technical hit) dispatch without waiting for Tier 4
  - [ ] Topic state updates run as deterministic reducer side-effects from Tier 2 output in the same tick
  - [ ] Gate decision runs after `Promise.all` — pure in-process logic, <5ms
  - [ ] Instrument each tier with a `performance.now`-based span; record `pipelineBudget` (target: <220ms without Tier 4, <720ms with)
- [ ] **Tier 2 semantic cache (B.6):**
  - [ ] Per-session LRU cache keyed by utterance embedding (cosine ≥ 0.97 = cache hit) or normalized text
  - [ ] Max ~200 entries per session, evict on LRU
  - [ ] On cache hit: reuse Tier 2 classification, skip the LLM call, still run Tier 3 (memory may have changed)
  - [ ] Target hit rate for boilerplate filler/confirmations: ≥30% — shaves ~$0.05 and ~100ms per hit
- [ ] **Async topic-summary refinement (new):**
  - [ ] Generate live topic summary text from reducer state first (no LLM in hot path)
  - [ ] Trigger LLM summary refinement only on topic shift, topic close, or significant semantic delta
  - [ ] Skip refinement when topic-state hash is unchanged (dedupe)
  - [ ] Keep refinement failures fail-silent; never block alerting pipeline
- [ ] **Per-meeting cost ceiling (B.7):**
  - [ ] Redis counter `meeting:cost:{sessionId}` incremented after every Tier 2 and Tier 4 call with actual `usage.totalTokens × pricePerToken`
  - [ ] Default cap: $2.00 per meeting (configurable per org)
  - [ ] On reaching 80% of cap: log a warning, raise Tier 4 gate thresholds (harder to trigger)
  - [ ] On reaching 100% of cap: disable Tier 4 entirely for the rest of the meeting, keep Tiers 1-3 and Tier 1 instant alerts running
  - [ ] Surface to dashboard on session end
- [ ] **Pipeline observability (B.11):**
  - [ ] Structured metrics per utterance: `sessionId`, `utteranceId`, `prefilterDropped`, `t1Latency`, `t2Latency`, `t2Cost`, `t2CacheHit`, `t3Latency`, `t3MatchCount`, `tier4Gated`, `t4Latency`, `t4Cost`, `alertEmitted`, `endToEndLatency`
  - [ ] Emit to stdout as one JSON line per utterance (easy to ship to any log aggregator)
  - [ ] Per-session rollup on meeting end: p50/p95/p99 latency, total cost, tier invocation counts, gate decision distribution
  - [ ] Basic Prometheus histograms for p50/p95/p99 end-to-end latency (optional — only if infra is in place; otherwise stdout JSON is sufficient for MVP)
- [ ] End-to-end test: utterance with commitment → Tier 2 writes to ledger → later contradicting utterance → Tier 3 catches → Tier 4 confirms → alert generated; validate total latency <800ms
- [ ] End-to-end test: topic summary remains up to date with Tier 2 deltas even when summary refinement LLM is unavailable
- [ ] Cost regression test: 1-hour scripted meeting fixture → total cost under budget (~$1.22 dual-channel nominal, $2.00 hard cap)
- [ ] Parallel-vs-sequential benchmark: same fixture run both ways, confirm parallel saves ~150-200ms p95

**Deliverable:** Complete four-tier pipeline with parallel 1-2-3 execution, per-session semantic cache, per-meeting cost cap, and structured observability. End-to-end p95 latency fits <800ms budget.

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

> **Note:** Prototype host capture started in Day 12-13, and production dual-channel intake is hardened in the Post-Day 23 patch. This phase is about wiring the React frontend around the finalized Rust capture/transport surface.

**apps/desktop**

- [ ] Set up React Router with app shell (tray/overlay window + optional main window)
- [ ] Create navigation structure (Home, Active Meeting, Settings, Onboarding)
- [ ] Build WebSocket connection manager (to **remote** realtime server)
- [ ] Implement session state in React context
- [ ] Wire the Rust audio-capture commands (`audio_capture_start/stop/status` from Day 12-13) to the React UI
- [ ] Build audio streaming controls around Rust-native WebSocket transport — React starts/stops capture and shows status; PCM frames do not cross the React runtime in production
- [ ] Add connection status indicator + audio-capture heartbeat
- [ ] Onboarding screen:
  - [ ] Sign in to org, join/select clients
  - [ ] Request OS permissions for mic (for local VAD) and system audio (screen recording on macOS)
  - [ ] **No voiceprint recording** — speaker ID is VAD-correlation based
- [ ] Build a minimal always-on-top overlay window (tray-style) for ambient UI during meetings — main window optional

**Deliverable:** Desktop app can capture OS-level audio (host) and stream to remote server. No conferencing-platform-specific code in the app.

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
- [ ] Add "Checking…" indicator for pending LLM calls — **content-free** (no preliminary text); replaced atomically when the final Tier 4 response arrives, or cleared if Tier 4 returns `shouldSurface: false` (B.8)
- [ ] Alerts are **atomic** once rendered: no live mutation of an alert's text, severity, or category after first render. If the Tier 4 response would change the alert, it is a brand-new alert with its own id (the old "Checking…" indicator clears, the new alert slides in).
- [ ] Hover-to-pause expiry

**Deliverable:** All 12 alert categories render with distinct styling, shared/personal distinction, and an atomic alert lifecycle (no progressive/flickering alerts — see [meeting-mode.md §5.9](./meeting-mode.md#59-live-llm-invocation-non-streaming-atomic-alerts)).

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
  Host dual-channel capture (Tauri/Rust: mic ch0 + loopback ch1) → Rust WebSocket → Remote server →
  Deepgram (multichannel diarized) → host-channel short-circuit + VAD-correlation speaker identification →
  Utterance (with SpeakerIdentity) →
  Pre-filter → Tier 1 → Tier 2 (small LLM) → Tier 3 (embedding search) →
  Tier 4 (large LLM) → Alert (with routing) → Shared/Personal channels →
  All connected Larity desktop instances
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
- [ ] Test speaker identification (VAD correlation):
  - [ ] 3+ speakers correctly identified (2 TEAM + 1 EXTERNAL at minimum)
  - [ ] Host correctly mapped from channel 0 without VAD
  - [ ] TEAM members correctly mapped from VAD signals → channel-1 diarization indices
  - [ ] External speakers labeled correctly (fallthrough case)
  - [ ] Retroactive reprocessing works when VAD arrives late
  - [ ] Simultaneous TEAM speech → both stay EXTERNAL until unambiguous
- [ ] Performance testing against latency budgets:
  - [ ] Pre-filter: <10ms
  - [ ] Tier 1: <50ms
  - [ ] Tier 2 (small LLM): <200ms
  - [ ] Tier 3 (embedding search): <100ms
  - [ ] Tier 4 (large LLM): <500ms
  - [ ] Voice identification: <100ms
  - [ ] End-to-end: <800ms
- [ ] Cost verification (~$1.22 per hour-long dual-channel meeting nominal, hard cap $2.00)
- [ ] Add structured logging throughout pipeline (per-utterance JSON lines — see Day 28)
- [ ] Implement basic observability (timing metrics, tier invocation counts, cost rollups)
- [ ] Fix bugs and edge cases

**Deliverable:** Working multi-user meeting mode with all 12 alert categories, VAD-correlation speaker identification, and tiered LLM pipeline end-to-end.

### Day 46+: Desktop Distribution & Auto-Update (B.10) — closes Week 6

**apps/desktop (Tauri)**

> A Tauri app is not a product until it can be signed, installed, and updated on end-user machines. This phase is explicitly called out because it was previously hidden inside "frontend polish" and consistently under-scoped in desktop projects.

- [ ] **Windows:**
  - [ ] Code-signing certificate procured (EV or OV); signing integrated into Tauri `bundle` step in CI
  - [ ] Installer format: MSI via `tauri build --bundles msi`; verify SmartScreen reputation over first few releases
- [ ] **macOS:**
  - [ ] Apple Developer ID application certificate; Developer ID Installer certificate
  - [ ] Signing + notarization via `notarytool` wired into CI
  - [ ] Hardened runtime enabled; entitlements file lists microphone + screen-recording (required for ScreenCaptureKit audio) + network client
  - [ ] Verify Gatekeeper pass on a clean machine before every release
- [ ] **Linux:**
  - [ ] `.deb` and `.rpm` packages via Tauri bundler
  - [ ] `.AppImage` as the universal fallback
  - [ ] Optional: publish to Flathub (longer timeline, post-MVP)
- [ ] **Auto-update:**
  - [ ] Tauri updater plugin configured with a signed update manifest
  - [ ] Update manifest hosted on a static bucket (S3/MinIO/Cloudflare R2) with Ed25519 signature
  - [ ] Staged rollout: 10% → 50% → 100% over 48h, controlled via manifest
  - [ ] In-app prompt: "Update available — restart to install" (non-blocking; updates only apply on next launch, never mid-meeting)
- [ ] **Crash reporting:** Sentry (or equivalent) wired on both Rust and JS sides with session-scrubbed breadcrumbs (never capture utterance text)

**Deliverable:** Signed, notarized, auto-updating installers for Windows, macOS (Intel + Apple Silicon), and Linux — distributable to real users.

---

## Week 7: Post-Meeting Pipeline

**Goal:** Process completed meetings, extract insights, and write to persistent memory.

### Day 47-48: Worker Infrastructure + Audio Persistence

**apps/workers + apps/realtime**

- [ ] Set up worker app structure
- [ ] Implement RabbitMQ consumer base class
- [ ] Create worker lifecycle management (graceful shutdown)
- [ ] Add health check endpoints
- [ ] Implement job retry logic with exponential backoff
- [ ] Set up worker logging and metrics
- [ ] **Audio persistence for post-meeting Whisper refinement (B.9):**
  - [ ] Stand up MinIO (S3-compatible) in the dev/staging compose stack, bucket `larity-audio`
  - [ ] `apps/realtime` streams each session's PCM frames **in parallel** to both Deepgram (live path) and MinIO (cold path) — the MinIO write is fire-and-forget, failures never block live processing
  - [ ] Chunk object layout: `s3://larity-audio/{orgId}/{sessionId}/{chunkIndex}.pcm16` (or Opus-encoded, if CPU budget allows — ~10× smaller)
  - [ ] Object lifecycle policy: auto-expire raw audio after 30 days unless the meeting is flagged for retention (org policy / legal hold)
  - [ ] Encryption: SSE-S3 / MinIO server-side encryption with per-org key
  - [ ] Manifest object on session close: `{sessionId}/manifest.json` with chunk list, codec, sample rate, total duration — consumed by the Whisper refinement worker
  - [ ] Quick-restore path for debugging: `/admin/sessions/:id/audio.wav` endpoint (admin-only) that stitches chunks back together

**Deliverable:** Worker infrastructure ready to consume jobs; raw session audio persisted to object storage for Whisper refinement, debugging, and selective long-term retention — without touching the live latency budget.

### Day 49-50: Transcript Processing Worker

**apps/workers**

- [ ] Implement `q.meeting.transcribe` consumer
- [ ] Pull the session's audio manifest from MinIO and feed the chunks into the Whisper API for batch STT refinement
- [ ] Compare Whisper output with Deepgram live transcript
- [ ] Merge/reconcile transcripts (prefer Whisper accuracy)
- [ ] **Preserve speaker identity attribution** (SpeakerIdentity, not binary)
- [ ] Store refined transcript to database
- [ ] Publish `transcript.ready` event

**Deliverable:** High-quality refined transcripts with multi-speaker attribution, sourced from the persisted raw audio.

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

## Week 9: Web Dashboard (apps/web) — NEW

**Goal:** Build the web app surface. This is a **read / manage / review** interface — never used during live meetings, never captures audio. It is the dashboard and log viewer.

> **Why a web app at all?** Post-meeting review (transcripts, decisions, commitments, tasks), client / team / policy management, and audit trails don't need to live in a desktop window. A web app is much easier to share (links to specific decisions, teammates without Larity installed, auditors). The desktop app and the web app both talk to the same `apps/control` REST API + read the same Postgres/pgvector data, so no duplication.

### Day 69-70: Web App Scaffold

**apps/web (new) — Next.js App Router or Vite + React + TanStack Router**

- [ ] Scaffold `apps/web` in the workspace
- [ ] Auth flow (shared with desktop app — same `apps/control` auth)
- [ ] App shell: nav (Dashboard, Meetings, Clients, Decisions, Commitments, Tasks, Team, Policy, Settings)
- [ ] Shared types from `packages/meeting-mode` / `packages/extraction` / Prisma client
- [ ] Design system (tokens, base components)

### Day 71-72: Meetings & Transcripts Views

- [ ] `/meetings` — list view with filters (client, date range, status)
- [ ] `/meetings/:id` — single meeting view:
  - [ ] Refined transcript with speaker attribution (TEAM names + EXTERNAL labels)
  - [ ] Topic timeline
  - [ ] Extracted decisions / tasks / open questions / commitments / important points
  - [ ] Alerts fired during the meeting (with category, severity, who saw it — shared vs personal)
  - [ ] Evidence links from every extracted item back to the transcript line

### Day 73-74: Decisions, Commitments, Tasks

- [ ] `/decisions` — versioned decision log, filterable by client, with full history
- [ ] `/commitments` — commitment log, status (TENTATIVE / CONFIRMED / CONTRADICTED / SUPERSEDED), contradiction chain view
- [ ] `/tasks` — Kanban + list, cross-meeting view
- [ ] `/open-questions` — unresolved items, promote-to-task action

### Day 75: Admin & Management

- [ ] `/team` — invite users, assign to clients, roles (LEAD/MEMBER/OBSERVER)
- [ ] `/clients` — CRUD clients, add policy guardrails per client
- [ ] `/policy` — org-wide and client-scoped guardrails (NDA terms, blocklists, approved terminology)
- [ ] `/settings` — API keys, Gemini model overrides, Deepgram key, org-wide alert thresholds

### Day 76: Search & Observability

- [ ] Global semantic search (pgvector) across decisions, commitments, important points
- [ ] Usage / cost dashboard (per-meeting cost, monthly totals, per-tier breakdown)
- [ ] Alert analytics (fire rate per category, false-positive flagging, confidence histograms)

**Deliverable:** Web dashboard is a full read/manage interface. Desktop app still owns meeting capture; web app owns everything else.

---

## Timeline Summary

| Week | Days | Focus | Key Deliverables |
|------|------|-------|------------------|
| 1 | 1-7 | **Migration & Multi-User** | Speaker model migration (YOU/THEM → SpeakerIdentity), Deepgram diarization, multi-user session join, Redis alert channels |
| 2 | 8-14 | **Speaker ID (VAD) + Prototype Audio Capture** | VAD signals from desktop mic, clock-offset-corrected diarization correlation, diarization-index merge baseline, prototype host capture in Tauri/Rust, meeting-detection prompts, direct realtime → Deepgram audio path (no Redis hop) |
| 3 | 15-21 | **State & Structural Detection** | Topic state, commitment ledger (**in-memory HNSW + Redis snapshot**, with embeddings), constraint ledger, pre-filter, Tier 1 structural |
| 4 | 22-28 | **LLM Classification & Search** | Tier 2 small LLM (single semantic source replacing all regex), **Post-Day 23 dual-channel intake hardening before Tier 3**, Tier 3 embedding search + commitment ledger search (shared embedding reuse), Tier 4 deep reasoning, **parallel Tier 1/2/3 orchestration, async topic-summary refinement off hot path, Tier 2 semantic cache, per-meeting cost cap, structured observability** |
| 5 | 29-36 | **Alert System & Speaker Tracking** | All 12 alert categories, alert routing (shared/personal), speaker state tracker, tone trajectory, client disengagement, speculative processing, **atomic alert UX (no progressive flicker)** |
| 6 | 37-46+ | **Desktop Frontend, E2E & Distribution** | Desktop UI (tray + overlay + main), ambient components, alert UI (12 categories), meeting mode screen, multi-user end-to-end testing, **signed/notarized installers + auto-update across Win/macOS/Linux** |
| 7 | 47-55 | **Post-Meeting** | Workers, **MinIO raw audio persistence (30-day lifecycle)**, Whisper refinement, speaker-attributed transcripts, commitment ledger → pgvector, extraction, memory writes |
| 8 | 56-68 | **Assistant** | Vector search, RAG, actions, auto-remembrance, UI (inside desktop app) |
| 9 | 69-76 | **Web Dashboard** | `apps/web` — meetings/transcripts/decisions/commitments/tasks review, team/client/policy admin, search, usage dashboard |

**Total: 76 working days (~11 weeks at 7 days/week, or ~15 weeks with weekends)**

> Weeks 8 (Assistant) and 9 (Web Dashboard) are largely parallelizable with a second developer.

---

## Package Structure

```
packages/
├── infra/                    # DONE (needs Prisma additions)
│   ├── redis/                # Client, pubsub, locks, TTL, keys
│   │                         # + New alert channel keys, commitment ledger keys
│   ├── rabbitmq/             # Connection, exchanges, queues, publish/consume
│   └── prisma/               # Schema, generated client
│                             # + Commitment model (no Voiceprint — VAD-based ID)
├── stt/                      # DONE (needs diarization changes)
│   ├── deepgram/
│   │   ├── client.ts         # Deepgram streaming client
│   │   ├── connection.ts     # CHANGE: channel_index + diarization parsing, remove source→speaker
│   │   └── types.ts          # CHANGE: add diarize:true, multichannel:true, channels:2
│   ├── subscriber.ts         # Redis audio subscriber
│   └── index.ts
├── meeting-mode/             # PARTIALLY DONE (major additions needed)
│   ├── utterance/
│   │   ├── types.ts          # CHANGE: Speaker→SpeakerIdentity, Utterance updated
│   │   ├── finalizer.ts      # CHANGE: defer speaker identity to VAD correlation step
│   │   ├── merger.ts         # CHANGE: compare speakerId not binary speaker
│   │   ├── ring-buffer.ts    # CHANGE: filter by type/speakerId not YOU/THEM
│   │   ├── persistent-ring-buffer.ts
│   │   └── buffer.ts
│   ├── speaker-identification/      # DONE (Day 9), HARDENED (Day 10-11) — VAD-correlation based
│   │   ├── identifier.ts           # SpeakerIdentifier (diarization ↔ VAD, reassignment-merge)
│   │   ├── vad-state.ts            # Per-session VAD state (Map<userId, {isSpeaking, ts}>)
│   │   ├── clock-offset.ts         # Per-client rolling median offset (last 30 samples)
│   │   ├── correlation.ts          # ±250ms offset-corrected timestamp correlation
│   │   ├── pending-buffer.ts       # Utterances awaiting late VAD confirmation (~2s)
│   │   └── types.ts                # SpeakerIdentity with diarizationIndices: {channel,index}[]
│   ├── state/
│   │   ├── topic-state.ts          # Topic clustering + completeness
│   │   ├── constraint-ledger.ts    # Constraint tracking
│   │   ├── commitment-ledger.ts    # NEW — in-memory HNSW (hot path) + Redis snapshot
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
│   │   ├── client.ts               # Gemini / provider adapter
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
```

> **No `services/voice-embedding/`, no Python microservice, no external speech-ML dependency.** Speaker identification is pure TypeScript: VAD signals from every team member's desktop app, correlated server-side against Deepgram diarization timestamps.

---

## Apps Status

```
apps/
├── control/                  # DONE - Elysia API
│   └── Needs: /meeting-session/join endpoint (DONE), expanded SessionData,
│              participant tracking (DONE)
├── realtime/                 # DONE - uWebSockets.js
│   └── Needs: multi-connection per session (DONE), host/participant roles (DONE),
│              broadcast to participants (DONE), alert channel subscriptions
├── desktop/                  # SCAFFOLD + VAD + prototype audio capture - Tauri + React
│   └── Needs: production dual-channel Rust audio transport (Post-Day 23 patch),
│              true Win/macOS loopback, React UI (Week 6), assistant (Week 8)
├── workers/                  # SCAFFOLD ONLY
│   └── Needs: Everything (Week 7)
└── web/                      # NOT YET CREATED
    └── Needs: Everything (Week 9 — dashboard / logs / admin)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Deepgram latency spikes | Implement timeout + skip, don't block pipeline |
| Deepgram diarization inaccurate | Host channel short-circuit handles host attribution; VAD-correlation handles non-host TEAM attribution on channel 1. Diarization still needs to be internally consistent (same index for same speaker within a window). Reassignment-merge logic (Day 10-11) collapses post-silence index swaps back onto the existing `SpeakerIdentity` so a single talker is never mistaken for two |
| Client clock drift / sleep-resume | Per-client rolling-median clock offset (Day 10-11) aligns VAD timestamps with the server clock; correlation window tightened to ±250ms |
| **macOS system audio capture denied / no ScreenCaptureKit permission** | Surface clear instructions + fallback instructions for virtual device (BlackHole); the user can still participate as a non-host |
| **macOS pre-13 support** | Require macOS 13+ for ScreenCaptureKit audio; document virtual-device fallback for older versions |
| **Linux missing PipeWire & PulseAudio** | Detect at startup, surface error asking user to use pipewire-pulse or pulseaudio; refuse to host without a monitor source |
| **Windows exclusive-mode audio apps** | WASAPI loopback cannot capture exclusive-mode sinks — warn user if detected; instruct them to turn off exclusive mode |
| VAD mis-fires on loud background noise | `@ricky0123/vad-web` thresholds already tuned; if correlated VAD fires while system-audio has no diarized speech, confidence-score the correlation lower |
| VAD correlation latency | Cache identified speakers; only first occurrence per diarization index triggers correlation |
| Host mic and loopback clocks drift apart | Align by sample counter, not wall-clock callback time; emit single-channel fallback if one source stalls |
| Client-side mixing distorts audio | Do not mix in dual-channel mode; send channels separately to Deepgram. If single-channel fallback must mix, use <=0.5 gain per source or a soft limiter |
| Rust → JS audio relay adds latency | Production path opens the realtime WebSocket from Rust and sends binary PCM directly; JS only controls start/stop/status |
| macOS/Windows loopback prototype captures nothing | Replace output-device `build_input_stream` fallback with ScreenCaptureKit/Core Audio process tap on macOS and true WASAPI loopback on Windows |
| Tier 2 LLM (small) too slow | 200ms timeout, fail-silent; if consistently slow, batch utterances |
| Tier 2 LLM classification quality | Test with multilingual samples; tune prompt; consider fine-tuning small model |
| Redundant semantic extraction between topic and Tier 2 | Tier 2 becomes single semantic source; topic summaries derive from reducer state with async refinement only on significant deltas |
| Tier 4 LLM response too slow | Streaming responses, 500ms timeout, fail-silent |
| Team inconsistency false positives | Require high similarity threshold for commitment ledger match + LLM confirmation |
| Client disengagement false positives | Require sustained pattern (5+ min), not just one short response |
| Multi-user WebSocket complexity | Clear host/participant role separation; host disconnect = session end (simple) |
| Redis pub/sub message loss | Accept loss for non-critical data; alerts use reliable delivery where possible |
| Speculative processing low hit rate | Monitor hit rate, adjust confidence threshold dynamically |
| Topic clustering inaccurate | Start with simple embedding, tune threshold iteratively |
| Whisper API latency | Async processing, user doesn't wait |
| Vector search slow | Add indexes, limit result count, cache frequent queries |
| **Commitment ledger grows large** | In-memory HNSW handles hundreds of commitments per session in sub-ms; cap at 500 per meeting; oldest low-priority ones archived |
| **Worker crash mid-meeting** | Redis snapshot of commitment ledger (Day 17-18) lets a replacement worker rehydrate the session's HNSW index on reconnect; ring buffer and topic state rehydrate from Redis too |
| **Cost exceeds budget** | Per-meeting cost counter in Redis (Day 28); at 80% of cap raise Tier 4 gate thresholds, at 100% disable Tier 4 for the remainder of the meeting |
| **Redundant Tier 2 LLM calls on repeated fillers** | Per-session semantic cache (Day 28) on utterance embedding similarity ≥ 0.97, ~30% hit rate on boilerplate confirmations |
| **Alert flicker / progressive alerts confusing users** | Single atomic alert per Tier 4 invocation (Day 41-42); "Checking…" indicator is content-free |
| **Alert fatigue** | Max 2 visible, priority queue, per-category confidence thresholds, Silent Collaborator mode |
| **Raw audio lost if realtime worker dies** | Parallel MinIO streaming (Day 47-48) persists every PCM chunk independently of the live pipeline |
| **Desktop auto-update installs during a live meeting** | Auto-update prompt only applies on next launch; installer never runs while a session is active |

---

## Success Metrics

### End of Week 2 (Speaker Identification + Prototype Audio Capture Complete)

| Metric | Target |
|--------|--------|
| VAD-correlation accuracy (TEAM members correctly identified) | > 90% |
| Diarization index → speaker mapping time | < 50ms |
| False identification rate (wrong team member assigned to an index) | < 5% |
| Retroactive reprocessing latency when VAD arrives late | < 500ms |
| Prototype host capture can feed realtime server | Yes |
| Linux loopback prototype captures meeting audio | Yes |

### End of Week 4 (Pipeline Complete)

| Metric | Target |
|--------|--------|
| Pre-filter drop rate | ~30-40% |
| Tier 1 (structural) latency | < 50ms |
| Tier 2 (small LLM) latency | < 200ms |
| Tier 3 (embedding search) latency | < 100ms |
| Tier 4 (large LLM) complete | < 500ms |
| `max(Tier1,Tier2,Tier3)` under parallel orchestration | ≤ 220ms p95 |
| End-to-end p95 (utterance → alert, with Tier 4) | ≤ 720ms |
| End-to-end p95 (utterance → no-alert, no Tier 4) | ≤ 220ms |
| Tier 2 classification accuracy | > 85% |
| Tier 2 multilingual accuracy (Hindi/Hinglish) | > 80% |
| Tier 2 semantic-cache hit rate on filler/confirmations | ≥ 30% |
| Host OS audio capture works on Windows 10+ | Yes |
| Host OS audio capture works on macOS 13+ (ScreenCaptureKit) | Yes |
| Host OS audio capture works on Linux (PipeWire + PulseAudio) | Yes |
| Dual-channel host frame integrity (ch0 mic + ch1 loopback) | 100% channel order correct |
| Host-channel identity short-circuit accuracy | 100% for ch0 utterances |
| End-to-end frame latency (capture → WS → server) | < 100ms |
| Commitment ledger top-K search (HNSW) | < 2ms |
| Commitment ledger snapshot write to Redis | < 20ms (async, off hot path) |
| Cost per 1-hour meeting (nominal, dual-channel all-in) | < $1.25 |
| Per-meeting cost cap enforcement | 100% (no session exceeds hard cap) |

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

### End of Week 6 (Meeting Mode Complete + Distributable)

| Metric | Target |
|--------|--------|
| Audio → identified utterance latency | < 300ms |
| End-to-end (utterance → alert) | < 800ms |
| Multi-user sync (alert appears for all) | < 100ms delta |
| All 12 alert categories functional | 100% |
| Speculative processing hit rate | > 80% |
| Alert render latency | < 32ms |
| Alert mutation rate after first render | 0% (atomic alerts only) |
| 3-speaker identification accuracy | > 85% |
| Signed + notarized installers for Win / macOS / Linux | Yes |
| Auto-update verified on all three platforms | Yes |

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
- **Google Gemini (`@google/genai`)** — Tier 2 classification (`gemini-3.1-flash-lite-preview`) and embeddings (`text-embedding-004` / Gemini embedding models)

### Infrastructure
- **Redis** — Already configured in packages/infra. Needs new key patterns for multi-user, commitment ledger snapshots, per-meeting cost counters, and pub/sub channels for ledger updates. **Not on the audio path.**
- **PostgreSQL + pgvector** — Already configured with Prisma. Needs pgvector extension + new `Commitment` model (no `Voiceprint` — speaker ID is VAD-based).
- **RabbitMQ** — Already configured for worker queues.
- **MinIO (S3-compatible object storage)** — Added Day 47-48 for raw audio persistence (Whisper refinement source + debugging). 30-day lifecycle; per-org encryption keys.
- **In-memory HNSW** (`hnswlib-node` or equivalent) — pulled into `packages/meeting-mode` for the commitment ledger hot path.

### Rust-Side Runtime Dependencies (Day 12-13 onwards)
See Desktop / OS-Level Dependencies below — all of this is bundled into the signed desktop installer (Day 46+).

### Desktop / OS-Level Dependencies (Tauri Rust side — Day 12-13)
- **`cpal`** (Rust) — cross-platform audio I/O baseline
- **Rust WebSocket client** — production PCM transport from the audio engine to `apps/realtime`; avoids Rust→JS IPC/base64 on the hot path.
- **Rust-side VAD** — WebRTC VAD or equivalent over the already-captured mic stream; browser VAD remains fallback only.
- **Windows** — WASAPI loopback (via `wasapi-rs` or cpal loopback-capable path). No driver install.
- **macOS** — ScreenCaptureKit audio / Core Audio process tap (macOS 13+). One-time screen-recording permission prompt. Fallback: BlackHole / Loopback virtual device.
- **Linux** — PipeWire or PulseAudio monitor source. No root / no kernel modules.

### No Python, No ML Service
No Python microservice. No voice-embedding models. No ONNX voiceprint inference. Speaker identification is pure TypeScript + VAD signals.

---

## Key Differences from Previous Timeline

| Aspect | Previous | Now |
|--------|----------|-----|
| **Speaker model** | `"YOU" \| "THEM"` binary | `SpeakerIdentity` with TEAM/EXTERNAL, userId, name |
| **Speaker identification** | Audio source (mic=YOU, tab=THEM) → voice embeddings + Python microservice | Host-channel short-circuit + VAD correlation (per-user local-mic VAD ↔ server-side Deepgram channel-1 diarization timestamps) — zero ML voice models, zero enrollment |
| **Audio capture** | Browser / Meet tab (extension) | **Dual-channel Tauri/Rust capture: host mic ch0 + OS-level system loopback ch1 (WASAPI / ScreenCaptureKit / PipeWire). Platform-agnostic — any conferencing app works.** |
| **Desktop vs. extension** | Chrome extension + Tauri assist | **Native Tauri desktop app only. No browser extension ever.** |
| **Web presence** | None | **`apps/web` dashboard for post-meeting review, admin, audit** |
| **Processing location** | Local (Tauri-spawned) | Remote shared server |
| **Session model** | Single user | Multi-user (host + participants) |
| **Tier 1** | Regex pattern libraries (risky, pressure, tone, scope, etc.) | Structural only (dates, numbers, blocklists, technical patterns) |
| **Tier 2** | Small classifier (local) | Small LLM (Gemini flash-lite) — replaces ALL regex patterns |
| **Tier 3** | Topic novelty check only | Embedding search (pgvector + commitment ledger) — safety net |
| **Pattern libraries** | ~8 regex pattern files | REMOVED — replaced by Tier 2 LLM |
| **Commitment ledger** | YOU + THEM, basic | Full SpeakerIdentity, embeddings, **in-memory HNSW (hot path) + Redis snapshot (durability)**, entire meeting |
| **Audio path** | Redis stream → consumer → Deepgram | **Direct Rust/uWS → Deepgram inside the realtime worker. No Redis, no Tauri IPC/base64, no JS PCM relay on audio bytes.** |
| **Pipeline orchestration** | Tiers 1→2→3→4 sequential | **Tiers 1, 2, 3 run in parallel; Tier 4 gated after** |
| **Tier 2 LLM calls** | One per post-filter utterance | **Per-session semantic cache on utterance embedding (~30% hit rate on filler), and Tier 2 output reused as topic-state semantic source** |
| **Cost control** | Nominal budget only | **Per-meeting Redis cost counter; gate tightening at 80% of cap; Tier 4 disabled at 100% of cap** |
| **Diarization index drift** | Ignored | **Reassignment-merge onto existing SpeakerIdentity after silence** |
| **Host speaker attribution** | VAD correlation like everyone else | **Channel 0 short-circuit maps directly to host identity; VAD correlation runs on channel 1 for non-host TEAM members** |
| **Client clock drift** | Fixed ±300ms tolerance | **Per-client rolling-median offset + ±250ms window** |
| **Alert UX** | Progressive / preliminary alerts | **Single atomic alert per Tier 4; content-free "Checking…" indicator only** |
| **Raw audio persistence** | Not specified | **Parallel fire-and-forget stream to MinIO, 30-day lifecycle** |
| **Desktop distribution** | "Tauri build" | **Code-signed Win MSI + notarized macOS universal + Linux .deb/.rpm/.AppImage; signed auto-update** |
| **Observability** | Ad-hoc smoke script | **Per-utterance JSON metrics + per-session rollups + optional Prometheus histograms** |
| **Alert categories** | 6-9 categories | 12 categories (added team_inconsistency, client_disengagement, undiscussed_agenda) |
| **Alert routing** | Single channel | Shared + personal channels per session |
| **Language support** | English only (regex) | Any language (LLM-based) |
| **New service** | Python microservice | **None — TypeScript everywhere** |
| **Week 1** | Deepgram integration | Codebase migration + multi-user foundation |
| **Week 2** | State management | VAD-based speaker ID + prototype audio capture |
| **Total duration** | 58 days (~6 weeks) | 76 days (~11 weeks, including web dashboard) |

---

## Notes

- This timeline assumes 1 developer working full-time
- 76 working days = ~11 weeks at 7 days/week, or ~15 weeks with weekends
- Week 1 is primarily migration work (updating existing code to new architecture)
- Audio intake is the biggest platform-specific workstream. Week 2 establishes the prototype capture path; the Post-Day 23 patch hardens production dual-channel capture before Tier 3/Tier 4 work builds on utterance shape.
- Pattern library work from the old timeline is completely removed (replaced by Tier 2 LLM)
- Weeks 7-8-9 can be parallelized if additional developers are available
- Adjust based on actual velocity after Week 1
- **No Chrome / Edge / Firefox extension.** Larity is a native desktop app (Tauri). The only web surface is the dashboard (`apps/web`) for post-meeting review and admin, and it never captures audio.
- **Platform-agnostic meeting capture is a core product bet** — the product must work identically on Zoom, Meet, Teams, Slack Huddle, Discord, SIP phone, or anything else that makes sound on the host's machine. Dual-channel host capture (mic + OS-level loopback) is the mechanism.
- **Alert system with 12 categories is a core differentiator — prioritize quality over speed**
- **Multi-user support is architecturally foundational — cannot be bolted on later**
- **VAD correlation accuracy is critical path — benchmark with real multi-person audio early**
