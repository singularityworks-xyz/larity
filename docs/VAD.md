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
    │  channel: meeting.vad.{sessionId}        │
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

---

## The Core Data Structures

### 1. Team Member Registry

When a participant joins the meeting, a `PARTICIPANT_JOIN` event is published via Redis:

```ts
interface ParticipantJoinEvent {
  sessionId: string;
  userId: string;      // Known — the user is authenticated
  name?: string;
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
// diarizationIndex → speakerId  (e.g., 0 → "spk_0", 1 → "spk_1")
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
  diarizationIndices: number[];
  isCurrentUser: boolean;
  confidence: number;
}
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
  const speakingMembers: string[] = [];

  for (const [userId, state] of this.vadState) {
    if (!state.isSpeaking) continue;

    // Does this VAD signal align with the utterance timestamp?
    const speakingDuration = utteranceTimestamp - state.startTs;
    if (speakingDuration < -this.config.correlationWindowMs) continue;

    speakingMembers.push(userId);
  }

  // Exactly one person was speaking → potential match
  if (speakingMembers.length === 1) {
    const userId = speakingMembers[0];
    const count = incrementConfirmationCount(userId, diarizationIndex);
    if (count >= minConfirmationSignals) {
      return userId;  // Confirmed!
    }
  }

  // Zero or multiple speakers speaking → can't correlate
  return undefined;
}
```

**Key rules:**

| Condition | Behavior |
|-----------|----------|
| 0 team members speaking | No correlation → `EXTERNAL` |
| 1 team member speaking | Increment confirmation counter; if ≥ threshold → **TEAM match** |
| 2+ team members speaking | Ambiguous → skip; log debug warning |

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

## Clock Offset Tracking

Desktop clocks drift. A VAD signal's `clientSendTs` (desktop time) and `serverReceiveTs` (server time) can diverge. The `ClockOffsetTracker` solves this by maintaining a median offset per user:

```ts
class ClockOffsetTracker {
  addSample(userId, clientTs, serverTs): void;
  getMedianOffset(userId): number;
  isUntrusted(): boolean;  // True until enough samples collected
}
```

The adjusted timestamp is used for all VAD-to-utterance correlation:

```ts
const adjustedTs = clientSendTs + medianOffset;
```

The system is designed to be conservative — `isUntrusted()` returns `true` until enough samples are collected, preventing false correlations during the clock synchronization phase.

---

## Complete Data Flow

```
Time ─────────────────────────────────────────────────────────►

Alice starts speaking on her desktop app:

  Her Larity app detects voice activity.
  → Emits VadSignal { userId: "alice", type: "vad_speaking" }
  → Published to Redis: meeting.vad.{sessionId}

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

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| VAD over voice embeddings | No ML model, no Python, no enrollment. Works for any speaker instantly. |
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
