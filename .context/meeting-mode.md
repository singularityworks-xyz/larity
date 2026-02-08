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

Real agency/team work involves multiple team members meeting with a client together on Google Meet. Larity supports this through a **host model**:

* **One team member is the host** — they run Larity and capture the system audio (Google Meet tab audio) from their machine
* **Other team members join the same shared meeting session** — they connect to the session but do NOT send system audio
* **All participants are remote** — everyone is on separate machines in the Google Meet call
* **The host's Larity instance is the single audio source** — it captures the combined meeting audio from the Google Meet tab

**Why host model:**
* Only one Deepgram STT connection needed (cost + consistency)
* No duplicate/conflicting transcriptions
* Single source of truth for the audio stream
* Simple to reason about — one audio pipeline, shared state

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
  meetingId: string                  // External meeting ID (Google Meet)
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

With multiple team members and external clients all speaking in the same Google Meet audio stream, the system needs to:

1. Identify which speaker is a **team member** vs **external client**
2. Identify **which specific team member** is speaking
3. Do this reliably across languages (Hindi, Hinglish, Tamil, English, etc.)

### 3.2 Rejected Approaches

**Mic on/off detection:** Unreliable. People don't mute between sentences. Can't distinguish who is unmuted when multiple people speak.

**Mic audio matching (secondary STT per team member):** Would require a separate Deepgram connection per team member's mic, running parallel STT, then matching text segments. Fragile text matching, expensive, complex.

### 3.3 Chosen Approach — Voiceprint Embeddings

#### Onboarding: Voice Sample Collection

Each team member records a **~30 second voice sample during onboarding** (not from meetings). This happens once per user, during initial setup.

* User reads a short passage or speaks freely for 30 seconds
* A voice embedding model (pyannote / wespeaker / resemblyzer) generates a **voiceprint vector** from the sample
* The voiceprint is stored in the database, linked to the user
* This is a one-time process — voiceprints are stable over time

#### Runtime: Speaker Identification Pipeline

During a live meeting, speaker identification works as follows:

1. **Deepgram runs with `diarize=true`**, returning speaker indices (speaker 0, speaker 1, speaker 2, etc.) — these are arbitrary integers, not identities
2. A **server-side Python microservice** (PyNode) extracts voice embeddings from each diarized speaker's audio segments
3. These embeddings are compared against **pre-loaded team voiceprints** via cosine similarity
4. **Matched speakers → TEAM** (with userId linked)
5. **Unmatched speakers → EXTERNAL** (client)
6. External speakers get names from **calendar data** (best-effort), NOT from stored voiceprints
7. **No voiceprint storage for external/client speakers** — not needed, not wanted

#### Conservative Default

The first 30-60 seconds of a meeting may have **unidentified speakers**. During this period:

* Unidentified speakers are treated as **EXTERNAL by default** (conservative — better to treat a team member as external temporarily than to accidentally attribute client speech to a team member)
* Once identified, **buffered utterances are retroactively reprocessed** with correct speaker attribution
* Identification improves as more audio from each speaker accumulates

### 3.4 Speaker Identity Model

This replaces the binary `"YOU" | "THEM"` model entirely:

```ts
interface SpeakerIdentity {
  speakerId: string               // Unique within this meeting session
  type: "TEAM" | "EXTERNAL"
  userId?: string                 // If TEAM, linked to User record
  name: string                    // Display name
  diarizationIndex?: number       // Deepgram's speaker integer (0, 1, 2...)
  isCurrentUser: boolean          // Is this the person viewing this Larity instance?
  confidence: number              // How confident the identification is (0-1)
}
```

**Key design points:**

* `isCurrentUser` determines which alerts are "self" alerts vs "team" alerts for each Larity instance
* A team member viewing their Larity instance sees their own self-contradictions as personal alerts, but sees other team members' contradictions as shared alerts
* `type: "EXTERNAL"` encompasses all non-team speakers — clients, their colleagues, anyone not in the org

### 3.5 Voice Embedding Service Architecture

The voice embedding service runs as a **Python microservice** on the server:

* **Model:** pyannote/wespeaker/resemblyzer (to be benchmarked — pyannote likely best for diarization-aware embeddings)
* **Interface:** Called by the main processing pipeline via internal API
* **Inputs:** Audio segment bytes + speaker diarization index
* **Outputs:** Embedding vector (512-dimensional typically)
* **Team voiceprints:** Pre-loaded into memory at session start for fast cosine similarity
* **Latency:** Embedding extraction ~50-100ms per segment, similarity check ~1ms

---

## 4. Entering Meeting Mode

### Trigger

* User opens Google Meet
* Larity extension detects meeting context
* **Host** explicitly clicks **"Start Meeting Mode"**
* Other team members click **"Join Meeting Session"** (or are auto-joined if pre-configured)

No automatic start for the host. Consent is explicit.

---

### Initialization Sequence (exact order)

#### Step 1 — Session Creation (Host Only)

* Extension calls `POST /meeting-session/start`
* Backend creates a `meetingSession` record on the **remote server**
* Session ID becomes authoritative
* Host begins audio capture

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
* **Team voiceprints** (loaded into memory for speaker identification)
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

* Tab audio stream (Google Meet combined audio — captures all participants)
* Deepgram connection opened with `diarize=true`

Team members do NOT arm audio pipelines — they receive processed utterances from the server.

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

1. Audio arrives at server from host's Larity instance (Google Meet tab audio)
2. Forwarded to streaming STT (Deepgram) with `diarize=true`
3. STT emits partial hypotheses **with speaker indices**
4. **Speculative processing begins on partials** (see 5.2)
5. Normalizer waits for `isFinal = true`
6. Voice embedding service identifies speaker from diarization index
7. Final utterance created:

```json
{
  "utteranceId": "u_193",
  "speaker": {
    "speakerId": "spk_3",
    "type": "TEAM",
    "userId": "user_rahul",
    "name": "Rahul",
    "diarizationIndex": 2,
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

### 5.4.2 Commitment Ledger (Redis, Entire Meeting)

The commitment ledger is the key mechanism for catching **intra-meeting contradictions**, including:
- **Self-contradictions** (same person contradicts themselves)
- **Team inconsistencies** (two team members contradict each other in front of the client)
- **Client backtracking** (external speaker changes previously agreed terms)

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

1. **Written live during the meeting** by Tier 2 whenever it classifies a commitment or decision
2. **Stores embedding vectors** for each commitment (for similarity search in Tier 3)
3. **Status evolves during the meeting:**
   - `tentative` → initial state when commitment is made
   - `confirmed` → when the other party agrees or the speaker reaffirms
   - `contradicted` → when a conflicting commitment is detected
   - `superseded` → when the speaker explicitly revises (not a contradiction — an intentional update)
4. **Searched by Tier 3** on every commitment/decision utterance
5. **At meeting end:** Handed off to post-meeting pipeline → written to PostgreSQL + pgvector → becomes organizational memory for future meetings

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

### 5.6 Trigger Evaluation — Tiered Processing Pipeline

This is the core intelligence pipeline. For each finalized utterance, it runs through four tiers. **The key design change from the original architecture: Tier 1 is purely structural/language-agnostic, Tier 2 uses a small LLM for classification (replacing all regex pattern libraries), Tier 3 runs on everything as a safety net, and Tier 4 is deep reasoning.**

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

**Single call to GPT-4o-mini or equivalent** per utterance that passes the pre-filter. This is the primary classification layer that replaces ALL the old regex pattern libraries.

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
- If `intent` is `"commitment"` or `"decision"` → **ALSO write to Commitment Ledger in Redis immediately** (with embedding)
- Everything continues to Tier 3 regardless (Tier 3 is a safety net)

**Cost:** ~$0.002 per call × ~72 calls per hour-long meeting (after pre-filter) = **~$0.14 per meeting for Tier 2**

#### Tier 3: Embedding Search + Novelty Check (~$0.00002/call, <100ms)

**Runs on EVERY utterance that passed the pre-filter** — not just commitments. This is a safety net. Even if Tier 2 misclassified something as filler, Tier 3's embedding search can catch it.

Three parallel checks:

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

**Tier 3 forcing logic:**
- If memory match found (similarity > threshold) → **force Tier 4** regardless of Tier 2 classification
- If commitment ledger match found (potential contradiction) → **force Tier 4**
- If Tier 2 already flagged this for Tier 4 → continues to Tier 4
- If no matches and Tier 2 said stop → **STOP**

**Cost:** ~$0.00002 per embedding call × ~80 calls per meeting = **~$0.002 per meeting for Tier 3**

#### Tier 4: Deep LLM Reasoning (~$0.02/call, 300-500ms)

**Large model (GPT-4o, Claude Sonnet via OpenRouter).** Only called for high-signal utterances — approximately **5-10% of total utterances** (~8-12 calls per hour-long meeting).

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
  message: string                              // Short, actionable
  suggestion?: string                          // Alternative phrasing or action
  confidence: number
  shouldSurface: boolean
  reasoning: string                            // For logging, not shown to user

  // Routing (see Section 7 — Alert Routing)
  routing: "shared" | "personal" | "both"
  targetUserId?: string                        // For personal alerts
}
```

If `shouldSurface = false` or `alertType = "none"`, nothing happens.

**Cost:** ~$0.02 per call × ~8 calls per meeting = **~$0.16 per meeting for Tier 4**

#### Total Cost Per 1-Hour Meeting

```
Pre-filter kills:     ~48 of 120 utterances (40%)
Tier 1 (structural):  ~72 utterances × $0 = FREE
Tier 2 (small LLM):   ~72 utterances × $0.002 = ~$0.14
Tier 3 (embeddings):  ~72 utterances × $0.00002 = ~$0.002
Tier 4 (large LLM):   ~8 utterances × $0.02 = ~$0.16
                                        TOTAL: ~$0.30 per meeting
```

#### Three Model Tiers

| Model | Purpose | Cost per call | Example |
|-------|---------|---------------|---------|
| **Embedding model** | Search, similarity, novelty | ~$0.00002 | text-embedding-3-small |
| **Small LLM** | Classification, extraction | ~$0.002 | GPT-4o-mini, Haiku |
| **Large LLM** | Deep reasoning, contradiction analysis | ~$0.02 | GPT-4o, Claude Sonnet |

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

### 5.9 Live LLM Invocation (Streaming)

When Tier 4 LLM validation is needed:

#### Streaming Response Pattern

```
T+0ms:    Utterance finalized, Tier 4 LLM call initiated
T+100ms:  Show subtle "Checking..." indicator (optional, only for current user's speech)
T+200ms:  LLM starts streaming, extract early confidence signal
T+300ms:  If high confidence risk, show preliminary alert
T+400ms:  Final alert with complete message and suggestion
```

Feels faster because feedback is progressive.

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
* Meet tab closes (host)
* Inactivity timeout (configurable, default 5 min)
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
│  Speaker Identification                                                     │
│  ├── Team voiceprints (pre-loaded from DB)                                 │
│  ├── Diarization index → SpeakerIdentity mapping                           │
│  ├── Speaker state trackers (tone trajectory, engagement per speaker)      │
│  └── Unidentified speaker buffer (retroactive reprocessing)                │
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
| Speaker identification | Yes | Voice embeddings + diarization | 50-100ms |
| Decision logging | No | Post-meeting only | — |
| Versioned decisions | No | Post-meeting only | — |
| Knowledge graph | No | Post-meeting only | — |
| Memory updates | No | Forbidden live | — |

---

## 12. Development Approach

### Phase 1: Core Pipeline
1. Audio capture (host) → WebSocket transport to remote server → Deepgram STT integration with `diarize=true`
2. Utterance finalizer with speaker diarization indices
3. Basic ring buffer implementation
4. Session lifecycle (start/join/end)
5. Multi-user session management (host + participants)

### Phase 2: Speaker Identification
1. Voice sample recording during onboarding
2. Voice embedding generation (Python microservice — pyannote/wespeaker)
3. Voiceprint storage in database
4. Runtime speaker identification (diarization index → voiceprint matching)
5. Unidentified speaker buffer + retroactive reprocessing
6. SpeakerIdentity model integration throughout pipeline

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
1. GPT-4o-mini / Haiku integration via OpenRouter
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
2. GPT-4o / Claude Sonnet integration via OpenRouter
3. Zod schema for Tier 4 output
4. Alert generation with routing (shared/personal/both)
5. Streaming response pattern (progressive feedback)

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
| Voice embedding extraction | 50ms | 100ms |
| Voice similarity check | 1ms | 5ms |
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
| Voice identification fails | Speaker treated as EXTERNAL (conservative default) |
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

**Meeting Mode is a conservative, stateful, multi-user, topic-aware real-time system running on a shared remote server that captures audio via a host, identifies speakers through voice embeddings, classifies utterances through a four-tier pipeline (structural → small LLM → embedding search → large LLM), tracks commitments across the entire meeting in a live ledger, detects self-contradictions and team inconsistencies and risky statements, warns about scope creep and pressure tactics and client backtracking, surfaces missing clarity and client disengagement, prevents information leaks, monitors tone trajectories, routes alerts to shared and personal channels across all connected team members, and never mutates organizational memory.**
