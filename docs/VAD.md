# VAD-Correlation Speaker Identification

## Why Not Voice Embeddings?

Most meeting assistants use voice-embedding-based speaker identification (speaker verification / diarization with enrollment). This requires:

- A Python microservice with ML models
- Voice enrollment for every team member
- Re-identification after every pause
- Handling noisy, overlapping, short utterances

Larity takes a different approach. Since every team member runs the Larity desktop app and is already authenticated, we can use **Voice Activity Detection (VAD)** as an out-of-band identity signal. Each desktop app knows exactly who is speaking at any moment (its own user), so the server can correlate that signal against Deepgram's diarization output.

No ML, no enrollment, no Python.

---

## Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Desktop App      │     │ Desktop App      │     │ Desktop App      │
│ (Alice)          │     │ (Bob)            │     │ (Client - none)  │
│                  │     │                  │     │                  │
│ ┌──────┐         │     │ ┌──────┐         │     │  No VAD sent     │
│ │ VAD  │─speaking│     │ │ VAD  │─silence │     │  (not running    │
│ │      │─silence │     │ │      │─speaking│     │   Larity)        │
│ └──────┘         │     │ └──────┘         │     │                  │
└────────┬─────────┘     └────────┬─────────┘     └──────────────────┘
         │                        │
         │ VadSignal              │ VadSignal
         │ { userId: "alice",     │ { userId: "bob",
         │   type: "vad_speaking" │   type: "vad_silence"
         │   clientSendTs,        │   clientSendTs,
         │   serverReceiveTs }    │   serverReceiveTs }
         │                        │
         ▼                        ▼
    ┌──────────────────────────────────────────┐
    │           Redis Pub/Sub                  │
    │  channel: realtime.vad.{sessionId}       │
    └──────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────────┐
    │           Server (Meeting Mode)          │
    │                                          │
    │  SpeakerManager                          │
    │   └─ SpeakerIdentifier (per session)     │
    │        ├─ teamMembers: Map<userId, info> │
    │        ├─ vadState: Map<userId, state>   │
    │        ├─ indexToSpeakerId: Map<idx, id> │
    │        └─ speakerMappings: Map<id, map>  │
    │                                          │
    │  Subscriber (Redis)                      │
    │   └─ on VAD signal → update state        │
    │   └─ on STT result → correlate + assign  │
    │   └─ on VAD (delayed) → retroactive fix  │
    └──────────────────────────────────────────┘
```

## Hybrid Mapping Update

Speaker attribution now uses a hybrid path:

1. **Provisional mapping on STT partials**: when partial transcripts arrive, the server correlates diarization index against recent VAD intervals and stores a short-lived provisional candidate in memory.
2. **Authoritative confirmation on STT finals**: when the final transcript arrives, the server first checks provisional candidate state, then falls back to direct VAD correlation.
3. **Retroactive VAD repair**: if VAD still arrives too late, ring-buffered `EXTERNAL` utterances can still be corrected and re-published.

This keeps attribution low-latency without blocking final utterance publish and improves resilience to variable final-segment timing.

---

## The Core Data Structures

### 1. Team Member Registry

When a participant joins the meeting, a `PARTICIPANT_JOIN` event is published via Redis:

```ts
interface ParticipantJoinEvent {
  sessionId: string;
  userId: string;      // Known — the user is authenticated
  name?: string;
  role?: "host" | "participant";
}
```

The server registers them:

```ts
identifier.registerTeamMember("user-alice", "Alice");
```

This creates a stable internal `speakerId` (e.g., `spk_0` for Alice) and stores their identity for correlation.

### 2. VAD State (Live Map)

Every team member's desktop app emits a `VadSignal` on every speech/silence transition:

```ts
interface VadSignal {
  type: "vad_speaking" | "vad_silence";
  userId: string;       // Which team member's desktop emitted this
  sessionId: string;
  clientSendTs: number; // Timestamp on the desktop machine
  serverReceiveTs: number;
  role?: "host" | "participant"; // host (mic) vs participant (system)
}
```

The `SpeakerIdentifier` maintains a live map:

```ts
private readonly vadState: Map<string, VadSpeakerState> = new Map();

// After processing a VAD signal:
vadState.set("user-alice", { isSpeaking: true, startTs: 1777905000000 });
```

### 3. Persistent Diarization-Index-to-Speaker Map

This is the key mapping that survives Deepgram's diarization resets:

```ts
// diarizationIndex → speakerId  (e.g., 0 → "spk_0", 1001 → "spk_1")
private readonly indexToSpeakerId: Map<number, string> = new Map();
```

Once index `0` is mapped to `spk_0` (Alice), every future utterance with index `0` immediately resolves to Alice **without re-correlation**.

### 4. Full Speaker Mappings

```ts
private readonly speakerMappings: Map<string, SpeakerMapping> = new Map();

interface SpeakerMapping {
  diarizationIndex: number;
  speaker: SpeakerIdentity;
  confirmedAt: number;
  confidence: number;
  lastUtteranceTs: number;
}
```

The `SpeakerIdentity` that gets attached to every utterance:

```ts
interface SpeakerIdentity {
  speakerId: string;     // e.g. "spk_0" or "spk_1"
  type: "TEAM" | "EXTERNAL";
  userId?: string;        // e.g. "user-alice" (only for TEAM)
  name: string;           // e.g. "Alice" or "Speaker 2"
  diarizationIndices: number[]; // Includes channel offsets (e.g. 1000+)
  isCurrentUser: boolean;
  confidence: number;
}

---

## Multi-Channel Namespace Isolation

Larity captures two logical sources:
- **Channel 0 (Mic)**: The host's own microphone.
- **Channel 1 (System)**: The meeting loopback (remote participants + clients).

To prevent ID collisions in `SpeakerIdentifier`, the `diarizationIndex` is offset by channel:
- **Mic Indices**: `0-999`
- **System Indices**: `1000-1999` (e.g., Deepgram index `0` on channel 1 becomes `1000`).

This ensures that a client speaking on the system channel never conflicts with the host speaking on the mic channel.

```

---

## The Correlation Algorithm

This is the heart of the system. Called on every final utterance from Deepgram.

```ts
identifySpeaker(diarizationIndex, utteranceTimestamp): SpeakerIdentity {
```

### Step 1: Fast Path — Already Mapped

```ts
const existingSpeakerId = this.indexToSpeakerId.get(diarizationIndex);
if (existingSpeakerId) {
  const mapping = this.speakerMappings.get(existingSpeakerId);
  if (mapping) {
    mapping.lastUtteranceTs = utteranceTimestamp;
    return mapping.speaker;  // ← Return immediately, no VAD lookup
  }
}
```

If we've seen this diarization index before and mapped it, we skip all VAD correlation. This is the common path — once index `0` is "Alice", it stays "Alice" for the rest of the session.

### Step 2: VAD Correlation — New Index

```ts
private correlate(diarizationIndex, utteranceTimestamp): string | undefined {
  const speakingMembers = this.getActiveMembersAt(utteranceTimestamp);

  // Hard Constraint: Role-Based Filtering
  // 1. System audio (>= 1000) should NEVER map to the host.
  // 2. Mic audio (< 1000) should NEVER map to a remote participant.
  const validMembers = speakingMembers.filter((userId) => {
    const member = this.teamMembers.get(userId);
    if (!member) return false;
    return isChannelRoleMatch(diarizationIndex, member.role);
  });

  // Exactly one person was speaking → potential match
  if (validMembers.length === 1) {
    const userId = validMembers[0];
    const count = incrementConfirmationCount(userId, diarizationIndex);
    if (count >= minConfirmationSignals) {
      return userId;  // Confirmed!
    }
  }

  return undefined;
}

/**
 * Hardened role-to-channel isolation:
 * - Host (Mic) is always on diarization index 0-999 (Channel 0).
 * - Participants (System) are always on diarization index 1000+ (Channel 1).
 */
function isChannelRoleMatch(diarizationIndex: number, role?: string): boolean {
  if (!role) return true;
  const isSystemChannel = diarizationIndex >= 1000;
  return role === "host" ? !isSystemChannel : isSystemChannel;
}
```

**Key rules:**

| Condition | Behavior |
|-----------|----------|
| 0 team members speaking | No correlation → `EXTERNAL` |
| 1 team member speaking (role match) | Increment confirmation counter; if ≥ threshold → **TEAM match** |
| 1 team member speaking (role mismatch) | Discarded → `EXTERNAL` (prevents system audio bleeding into mic) |
| 2+ team members speaking | Ambiguous → skip; log debug warning |

**Correlation Window**: Increased to **1500ms** to account for native VAD detection lag (Silero requires ~300ms of audio before emitting a speaking event).


### Step 3: Create Identity

If correlated to a team member:

```ts
return {
  speakerId: "spk_0",
  type: "TEAM",
  userId: "user-alice",
  name: "Alice",
  diarizationIndices: [0],
  isCurrentUser: false,
  confidence: 1,
};
```

If not correlated:

```ts
return createUnidentifiedSpeaker(diarizationIndex); // → type: "EXTERNAL"
```

---

## Handling Deepgram Diarization Index Resets

Deepgram's diarization indices are ephemeral. A speaker may get index `0` in one segment and index `3` in the next after a pause. The system handles this through three layered mechanisms.

### Layer 1: Persistent `indexToSpeakerId` Map

Once index `0` is mapped to Alice, that mapping persists for the entire session. Even if index `0` goes silent for 5 minutes and reappears, it still resolves to Alice immediately. The map is never cleared mid-session.

### Layer 2: Confirmation Counters Prevent False Mapping

When an **unseen** diarization index appears, the system requires **multiple consecutive VAD matches** before confirming:

```ts
private readonly confirmationCounts: Map<userId, Map<diarizationIndex, count>>;
```

This prevents a one-off alignment from incorrectly tagging a client utterance as a team member.

### Layer 3: 15-Second Gap Rule for Recycled Indices

If Deepgram recycles index `0` (which was Alice) and assigns it to a different physical speaker, the system detects this via a gap check:

```ts
const gap = utteranceTimestamp - existingMapping.lastUtteranceTs;

if (gap > 15_000) {
  // Same person returning after a break → reuse mapping
  mapping.speaker.diarizationIndices.push(diarizationIndex);
  return mapping.speaker;
}

// Gap ≤ 15s: conflict! Two people speaking on same index →
// create a new speaker identity
return this.createTeamIdentity(correlatedUserId, name, diarizationIndex);
```

| Scenario | Gap | Behavior |
|----------|-----|----------|
| Alice speaks on index 0, pauses 30s, speaks again on index 0 | >15s | Same identity, reused |
| Alice speaks on index 0, then client speaks on index 0 <15s later | ≤15s | New identity created |
| Server restart / late join | N/A | Hydrated from Redis persistence |

---

## Retroactive Identification (The Ring Buffer Fix)

VAD signals travel from the desktop app → Redis → server, which takes 100-500ms of network latency. Deepgram audio travels directly, arriving faster. This means the VAD signal identifying Alice may arrive **after** her utterance has already been tagged as `EXTERNAL`.

### The Ring Buffer

Every finalized utterance is stored in a session-scoped ring buffer:

```ts
ringBuffer.push(utterance);
```

Properties:

| Setting | Value |
|---------|-------|
| Max utterances | 100 |
| Max age | 120 seconds |
| Lookup | By `speakerId` or chronological |

### Retroactive Fix on VAD Arrival

When a VAD signal arrives, the subscriber immediately:

```ts
function handleVadSignal(message) {
  // 1. Update VAD state (which team member is speaking)
  speakerManager.handleVadSignal(signal);

  // 2. Query the ring buffer for recent unidentified utterances
  const recentTs = Date.now() - 2000;
  const pendingUtterances = ringBuffer
    .getAll()
    .filter(u => u.speaker.type === "EXTERNAL" && u.timestamp >= recentTs);

  // 3. Try to correlate each one against the new VAD state
  const newlyIdentified = identifier.tryLateIdentification(
    signal, pendingUtterances
  );

  // 4. Retroactively re-assign any matches
  for (const { speaker } of newlyIdentified) {
    finalizer.processRetroactiveIdentification(sessionId, index, speaker);
  }
}
```

The `tryLateIdentification()` method (identifier.ts:254-300) runs the same correlation logic against **all** pending utterances. If it finds a match, the utterance is re-published with the corrected `SpeakerIdentity`.

```ts
// Inside processRetroactiveIdentification:
utterance.speaker = newSpeaker;
await this.publishUtterance(utterance); // Re-publish with corrected identity
```

This means the pipeline may process the utterance **twice**: once as EXTERNAL, and then again as TEAM with the retroactive fix.

---

### 1. Clock Synchronization Handshake

When the desktop app starts streaming audio, it sends a control event `audio_stream_start` containing:
- `clientTs`: Local wall-clock time on the desktop.
- `clientSendTs`: Precise timestamp when the packet was sent.

The server calculates `networkLatency = (serverReceiveTs - clientSendTs) / 2` and anchors the STT stream start at `serverAudioStartTs = clientTs + networkLatency`. This ensures that even with high one-way latency, the STT timeline is correctly anchored to the client's wall clock.

### 2. Sliding Window Median Filter

Desktop clocks drift and network jitter is random. The `ClockOffsetTracker` handles this by maintaining a **sliding window median** (last 30 samples) per user:

1. **Sampling**: Every VAD signal includes `clientSendTs`.
2. **Offset Calculation**: `offset = serverReceiveTs - clientSendTs - estimatedRTT`.
3. **Median Smoothing**: The median of the window is used as the authoritative offset. Median is robust to sudden network "spikes" and jitter.
4. **Drift Detection**: If the median shifts by more than 500ms suddenly, the clock is marked as `untrusted` for 2 seconds to prevent miscorrelation.

The adjusted timestamp is used for all VAD-to-utterance correlation:

```ts
const adjustedTs = clientSendTs + medianOffset;
```

---

## Complete Data Flow

```
Time ─────────────────────────────────────────────────────────►

Alice starts speaking on her desktop app:

  Her Larity app detects voice activity.
  → Emits VadSignal { userId: "alice", type: "vad_speaking" }
  → Published to Redis: realtime.vad.{sessionId}

  50ms later: Server receives VAD signal.
  → SpeakerIdentifier.processVadSignal(signal)
  → vadState.set("alice", { isSpeaking: true, startTs: adjusted })

  200ms later: Deepgram emits utterance with speaker=0.
  → UtteranceFinalizer.process(result)
  → resolveSpeaker(sessionId, 0, timestamp)
  → SpeakerIdentifier.identifySpeaker(0, timestamp)

  Inside identifySpeaker:
    1. indexToSpeakerId.get(0) → undefined (first time)
    2. correlate(0, timestamp)
       → alice is in vadState, isSpeaking=true, within window ✓
       → incrementConfirmationCount("alice", 0)
       → count >= minConfirmationSignals (1) ✓
       → return "user-alice"
    3. createTeamIdentity("user-alice", "Alice", 0)
       → SpeakerIdentity { type: "TEAM", name: "Alice", ... }
    4. indexToSpeakerId.set(0, "spk_0")
    5. speakerMappings.set("spk_0", { ... })

  Utterance is tagged as Alice from the beginning.

  ── Utterance flows through pipeline:
     PreFilter → Tier 1 → Tier 2 → Tier 3 → SpeakerStateTracker → Tier 4
     All downstream systems see speaker.type = "TEAM", userId = "user-alice"

  ── Later: Bob's VAD signal arrives late.
     Ring buffer has recent utterances tagged EXTERNAL.
     tryLateIdentification matches them to Bob.
     Utterances retroactively re-assigned to Bob.
     Pipeline re-processed with corrected identity.
```

---

## Migrations & Bugfixes

### Migration 1: Browser VAD → Rust-Native VAD (Desktop)

The original VAD implementation used `@ricky0123/vad-web` which depends on `onnxruntime-web` (WASM). This was **fundamentally broken** on Linux Tauri (WebKitGTK) due to module-system incompatibilities between Emscripten-generated WASM wrappers and Vite's bundler.

**Fix:** Replaced with the `voice_activity_detector` Rust crate (Silero VAD V5, native ONNX Runtime):

```text
Desktop mic → AudioProcessor (16kHz mono i16) → VoiceActivityDetector::predict()
    ├── prob ≥ 0.3 (with 16× gain, 3-frame debounce) → emit "vad-speech-start"
    └── prob < 0.3 → emit "vad-speech-end"
```

| Aspect | Browser VAD (old) | Rust VAD (new) |
|--------|-------------------|----------------|
| Module | `@ricky0123/vad-web` | `voice_activity_detector` crate |
| Model | Silero VAD (bundled WASM) | Silero VAD V5 (ONNX Runtime) |
| Chunking | 512-sample windows (non-buffered) | Accumulates into 512-sample windows from 800-sample producer chunks |
| Gain | None | 16× (+24dB) for quiet-mic compensation |
| Debounce | None | 3 consecutive frames required to transition |
| Events | N/A (was broken on Linux) | Tauri `app.emit("vad-speech-start"/"vad-speech-end")` |

**Files involved:** `apps/desktop/src-tauri/src/audio/vad.rs`, `apps/desktop/src/services/vad.ts`, `apps/desktop/src/routes/settings.tsx`

### Migration 2: `ts` (Processing Time) → `speechTimestamp` (Actual Speech Time)

The original correlation used `SttResult.ts` = `Date.now()` (when Deepgram finished processing, 3–8s after speech). VAD intervals represent speech-event time (client send time adjusted by median clock offset). The discrepancy caused missed correlations for short utterances.

**Fix:** Added `SttResult.speechTimestamp = connectionStartTime + (start × 1000)` where `start` is Deepgram's seconds-offset-from-stream-start:

```text
Deepgram connection opens at T=0
    → connectionStartTime = Date.now() (in DeepgramConnection)
User speaks at T=5s
    → Deepgram returns result.start = 5.0, result.ts = T+8 (processing finished)
    → speechTimestamp = connectionStartTime + 5000  ← actual speech time (ms)
    → SpeakerIdentifier compares against VAD intervals using speechTimestamp
    → VAD interval [T+4.9, T+7.5] overlaps speechTimestamp ±250ms ✓ → TEAM
```

| Field | Used for | Source |
|-------|----------|--------|
| `SttResult.ts` | Processing-order metadata | `Date.now()` in handler (unchanged) |
| `SttResult.speechTimestamp` | VAD correlation | `connectionStartTime + start×1000` (NEW) |

**Files:** `packages/stt/src/types.ts`, `packages/stt/src/deepgram/connection.ts`, `packages/meeting-mode/src/utterance/finalizer.ts`, `packages/meeting-mode/src/subscriber.ts`

### Bugfix: Elysia Auto-Parses JSON → Object (Realtime Server)

The realtime server uses Elysia's WebSocket handler. Elysia automatically parses incoming stringified JSON messages into JavaScript objects **before** passing them to the `message()` callback. The original code checked `typeof message === "string"` and called `JSON.parse()` — but by the time the handler runs, `message` is already a parsed object:

```typescript
// BEFORE (broken):
if (typeof message === "string") {
    const payload = JSON.parse(message);  // Always fails — message is an object!
    if (payload.type === "vad_speaking") { ... }
}

// AFTER (fixed):
if (typeof message === "object" && message !== null && !Buffer.isBuffer(message) && !(message instanceof Uint8Array)) {
    const payload = message as Record<string, unknown>;
    if (payload.type === "vad_speaking") { ... }
}
```

**Files:** `apps/realtime/src/handlers/on-message.ts`

### Bugfix: Redis Channel Name Mismatch

The realtime server published VAD signals to `meeting.vad.<sessionId>` but meeting-mode subscribed to `realtime.vad.*`. These never matched, so VAD signals were silently dropped in Redis.

**Fix:** Changed `vadChannel()` in `apps/realtime/src/redis/channels.ts` from `meeting.vad.${sessionId}` to `realtime.vad.${sessionId}` to match meeting-mode's subscriber pattern.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| VAD over voice embeddings | No ML model, no Python, no enrollment. Works for any speaker instantly. |
| Role-Based Gating | Prevents host mic identity from bleeding into system audio loopback. |
| Dual-Channel Isolation | Explicitly separates Mic (0-999) from System (1000+) diarization indices. |
| 1500ms Correlation Window | Accommodates Silero VAD engine latency and network jitter. |
| Per-session `indexToSpeakerId` | Survives Deepgram diarization resets. Once index is mapped, it stays mapped. |
| Confirmation counters | Prevents one-off VAD-Deepgram alignment from causing false positives. |
| Ring buffer + retroactive fix | Solves the inherent network race between VAD (desktop→Redis) and audio (direct). |
| Clock offset tracking | Desktop clocks drift; VAD timestamps need calibration against server time. |
| `EXTERNAL` is the default | Any speaker that can't be correlated to a team member is conservatively tagged as client. |

## Directory Reference

| File | Role |
|------|------|
| `packages/meeting-mode/src/speaker/identifier.ts` | Core `SpeakerIdentifier` class |
| `packages/meeting-mode/src/speaker/manager.ts` | Session-scoped manager for identifiers |
| `packages/meeting-mode/src/speaker/clock-offset.ts` | Clock offset tracker |
| `packages/meeting-mode/src/speaker/persistence.ts` | Redis persistence for speaker mappings |
| `packages/meeting-mode/src/speaker/types.ts` | All VAD and speaker types |
| `packages/meeting-mode/src/utterance/finalizer.ts` | Utterance finalization + retroactive fix |
| `packages/meeting-mode/src/utterance/ring-buffer.ts` | Ring buffer for retroactive lookups |
| `packages/meeting-mode/src/subscriber.ts` | Redis subscriber wiring VAD → identifier |
| `packages/stt/src/types.ts` | `SttResult` type with `speechTimestamp` |
| `packages/stt/src/deepgram/connection.ts` | `DeepgramConnection` — records `connectionStartTime`, computes `speechTimestamp` |
| `apps/realtime/src/handlers/on-message.ts` | WebSocket message handler — routes VAD signals (object type) |
| `apps/realtime/src/redis/channels.ts` | Redis channel names (`realtime.vad.*`) |
| `apps/desktop/src-tauri/src/audio/vad.rs` | Rust-native Silero VAD (Tauri backend) |
| `apps/desktop/src/services/vad.ts` | Frontend VAD manager — Tauri event listeners |
| `apps/desktop/src/services/audio-streaming.ts` | `sendVadSignal()` — sends VadSignal over WebSocket |
