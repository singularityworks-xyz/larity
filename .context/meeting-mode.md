# LARITY — MEETING MODE (COMPLETE SPECIFICATION)

This is the **primary execution mode of the product**. Everything else (dashboard, memory, analytics) exists to support this.

---

## 1. What Meeting Mode Is

**Meeting Mode = a conservative, real-time, read-only intelligence loop with ambient awareness.**

Core properties:

* Runs only while a meeting is active
* Never mutates long-term memory
* Operates under strict latency budgets
* Optimized for **risk prevention**, not creativity
* Feels alive through ambient signals, not noise
* Conservative by design, responsive by engineering

Think of it as a **flight control system** — silent when things are fine, immediate when they're not.

---

## 2. Entering Meeting Mode

### Trigger

* User opens Google Meet
* Larity extension detects meeting context
* User explicitly clicks **"Start Meeting Mode"**

No automatic start. Consent is explicit.

---

### Initialization Sequence (exact order)

#### Step 1 — Session Creation
* Extension calls `/session/start`
* Backend creates a `meetingSession` record
* Session ID becomes authoritative

#### Step 2 — Context Preload (critical)

Before any audio is processed, backend preloads:

* Open decisions (last N weeks)
* Known constraints (delivery, legal, capacity)
* Active policy guardrails
* Unresolved risks
* Org-level rules

This data is cached in memory for the session.

#### Step 3 — Predictive Constraint Pre-embedding

* Parse meeting agenda (if available)
* Identify likely topics from calendar context
* Pre-embed constraint matches for predicted topics
* Build hot cache of topic → constraint mappings

When topic shifts occur, relevant constraints are already loaded.

#### Step 4 — Short-term Buffers Initialized

* Ring buffer (utterances)
* Topic state map
* Constraint ledger
* Commitment ledger
* Trigger debounce state

#### Step 5 — Audio Pipelines Armed

* Mic stream (YOU)
* Tab audio stream (OTHERS)

#### Step 6 — Ambient UI Activated

* Topic indicator initialized (empty state)
* Constraint counter set to preloaded count
* Listening heartbeat enabled

At this point, Meeting Mode is **armed and visibly alive**.

---

## 3. Live Meeting Loop

This loop runs continuously until the meeting ends.

---

### 3.1 Audio → STT → Utterance Pipeline

**For every audio chunk:**

1. Audio arrives at backend (tagged mic/tab)
2. Forwarded to streaming STT (Deepgram)
3. STT emits partial hypotheses
4. **Speculative processing begins on partials** (see 3.2)
5. Normalizer waits for `isFinal = true`
6. Final utterance created:

```json
{
  "utteranceId": "u_193",
  "speaker": "YOU",
  "text": "We can ship by Friday",
  "timestamp": 1730000123
}
```

Only **final utterances** trigger alerts. Speculative work accelerates response.

---

### 3.2 Speculative Processing (Latency Optimization)

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

### 3.3 Topic Tracking

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
}
```

**Ambient UI update:** Topic indicator shows current `label`. Updates on topic shift.

---

### 3.4 Constraint & Commitment Ledgers

#### Constraint Ledger (explicit facts)

```ts
interface Constraint {
  id: string
  type: "date" | "capacity" | "policy" | "dependency" | "legal"
  value: string                    // "QA capacity limited to 60%"
  source: "preloaded" | "meeting"  // Where it came from
  utteranceId?: string             // If from meeting
  confidence: number
  topicIds: string[]               // Which topics reference this
}
```

**Ambient UI update:** Constraint counter increments when new constraint detected.

#### Commitment Ledger (provisional)

```ts
interface Commitment {
  id: string
  statement: string                // "Ship by Friday"
  speaker: "YOU" | "THEM"
  topicId: string
  status: "tentative" | "confirmed" | "contradicted"
  timestamp: number
}
```

Commitments are tracked, not persisted. They inform contradiction detection.

---

### 3.5 Trigger Evaluation (Tiered, Speed-Optimized)

For each finalized utterance, run tiers in parallel where possible:

#### Tier 1: Deterministic Fast Path (<50ms)

| Check | Method | Response |
|-------|--------|----------|
| Policy keyword match | Regex | Instant alert |
| Date/deadline mentioned | Parser | Instant note |
| Forbidden terms (NDA, etc.) | Keyword set | Instant warning |
| Scope change language | Pattern match | Queue for validation |

**These surface immediately.** No LLM needed.

#### Tier 2: Intent Classification (<100ms)

* Small classifier model (local or edge)
* Labels: `commitment`, `decision`, `question`, `concern`, `risk`, `filler`
* If `filler` or low confidence → stop here

#### Tier 3: Topic Novelty Check (<50ms)

* Has this been handled in this topic already?
* Is this materially different from previous?
* If not novel → debounce, don't alert

#### Tier 4: LLM Validation (300-500ms, streaming)

Only reached for high-signal utterances that pass Tiers 1-3.

---

### 3.6 Speaker-Aware Processing

**YOUR speech gets priority treatment:**

```ts
if (speaker === "YOU") {
  // Run all tiers in parallel (not sequential)
  // Lower confidence threshold for surfacing (0.7 vs 0.85)
  // Priority queue position for LLM calls
  // Suggestions are time-critical — you're about to stop talking
}

if (speaker === "THEM") {
  // Sequential tier processing is fine
  // Higher confidence threshold (0.85)
  // Standard queue position
  // You have time — they're still talking
}
```

This ensures responsiveness when it matters most.

---

### 3.7 Live LLM Invocation (Streaming)

When LLM validation is needed:

#### Context Assembly (narrow, bounded)

```ts
interface LLMContext {
  knownConstraints: Constraint[]    // Relevant to current topic
  recentCommitments: Commitment[]   // Last 3-5 in topic
  topicSummary: string              // Compressed, not raw transcript
  newStatement: string              // The utterance being evaluated
  speakerRole: "YOU" | "THEM"
}
```

**No full transcript. No vector search. No long-term memory access.**

#### Streaming Response Pattern

```
T+0ms:    Utterance finalized, LLM call initiated
T+100ms:  Show subtle "Checking..." indicator (optional, only for YOU speaker)
T+200ms:  LLM starts streaming, extract early confidence signal
T+300ms:  If high confidence risk, show preliminary alert
T+400ms:  Final alert with complete message and suggestion
```

Feels faster because feedback is progressive.

#### LLM Output Schema (Zod-enforced)

```ts
interface LLMResponse {
  type: "warning" | "suggestion" | "clarification" | "none"
  severity: "low" | "medium" | "high"
  message: string                   // Short, actionable
  suggestion?: string               // Alternative phrasing
  confidence: number
  shouldSurface: boolean
  reasoning?: string                // For logging, not shown to user
}
```

If `shouldSurface = false` or `type = "none"`, nothing happens.

---

### 3.8 Ambient Awareness Layer

Non-intrusive signals that prove the system is alive:

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

**These are NOT alerts.** They're ambient proof of awareness.

---

### 3.9 Alert Surfacing Rules

Only YOU see alerts. Alerts are:

* **Short** — one sentence, actionable
* **Contextual** — reference what was just said
* **Dismissible** — swipe or click to dismiss
* **Auto-expire** — fade after relevance window (10-15 seconds)
* **Non-stacking** — max 2 visible at once, queue the rest

#### Alert Types by Speed

| Type | Source | Latency | Example |
|------|--------|---------|---------|
| Policy warning | Tier 1 regex | <50ms | "NDA term mentioned" |
| Date flagged | Tier 1 parser | <50ms | "Deadline: Friday noted" |
| Risk detected | Tier 4 LLM | 300-500ms | "This may conflict with QA capacity constraint" |
| Suggestion | Tier 4 LLM | 300-500ms | "Consider: 'We're targeting Friday pending QA'" |

---

## 4. Specialized Live Subsystems

### 4.1 Silent Collaborator Mode (Default)

Behavior:
* No proactive speaking
* No chatty responses
* Only surfaces high-signal events

Surfaces only:
* Contradictions against known constraints
* Risky commitments
* Policy violations
* Significant sentiment shifts

### 4.2 Sentiment Shift Detection

Not "overall mood." Detects **deltas**.

Mechanism:
* Track baseline sentiment per topic
* Detect negative inflection, not absolute tone
* Fire only on significant shift

Example:
> "Okay..." → neutral
> "Okay, but that's not what we agreed" → shift detected

Surfaces as: "Client tone shifted negative on delivery scope"

### 4.3 Policy Guardrails (Live)

Two-step system:

1. **Deterministic scan** (Tier 1)
   * NDA terms, forbidden commitments, restricted disclosures
   * Instant alert if matched

2. **Contextual validation** (Tier 4)
   * LLM confirms if it's a real violation vs. false positive
   * Upgrades or downgrades alert severity

Never blocks speech. Only warns.

### 4.4 Live Suggestions

Triggered mostly when **YOU speak**.

Purpose:
* Safer phrasing alternatives
* Clarifying follow-up questions
* Risk-aware response options

Never:
* Long answers
* Strategy dumps
* Summaries
* Unsolicited advice

---

## 5. Exiting Meeting Mode

### Exit Triggers

* User clicks "End Meeting"
* Meet tab closes
* Inactivity timeout (configurable, default 5 min)

### Finalization Sequence

1. Live pipelines stop
2. Short-term buffers frozen
3. Topic states serialized for post-processing
4. Constraint/commitment ledgers handed off
5. Raw audio persisted (if enabled)
6. Async jobs queued:
   * Batch STT refinement (Whisper)
   * Speaker diarization
   * Transcript chunking
   * Decision/task extraction

**Live state is destroyed. Canonical memory begins.**

---

## 6. State Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     MEETING SESSION                         │
├─────────────────────────────────────────────────────────────┤
│  Preloaded Context (read-only)                              │
│  ├── Org constraints                                        │
│  ├── Policy guardrails                                      │
│  ├── Open decisions                                         │
│  └── Predicted topic constraints (pre-embedded)             │
├─────────────────────────────────────────────────────────────┤
│  Live State (mutable during meeting)                        │
│  ├── Topic State Map                                        │
│  │   └── TopicState[]                                       │
│  ├── Constraint Ledger                                      │
│  │   └── Constraint[] (preloaded + meeting-discovered)      │
│  ├── Commitment Ledger                                      │
│  │   └── Commitment[]                                       │
│  ├── Ring Buffer                                            │
│  │   └── Recent utterances (60-120 seconds)                 │
│  └── Speculative Cache                                      │
│      └── Pre-computed results for partial utterances        │
├─────────────────────────────────────────────────────────────┤
│  Ambient UI State                                           │
│  ├── Current topic label                                    │
│  ├── Constraint count                                       │
│  └── Listening status                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Feature → Meeting Mode Mapping

| Feature | In Meeting Mode? | How | Latency |
|---------|------------------|-----|---------|
| Live response suggestions | Yes | Triggered, gated, streaming | 300-500ms |
| Silent collaborator | Yes | Default behavior | — |
| Sentiment detection | Yes | Delta-based, topic-scoped | <100ms |
| Policy guardrails | Yes | Deterministic + LLM | 50-500ms |
| Topic tracking | Yes | Ambient indicator | Real-time |
| Constraint tracking | Yes | Ambient counter | Real-time |
| Decision logging | No | Post-meeting only | — |
| Versioned decisions | No | Post-meeting only | — |
| Knowledge graph | No | Post-meeting only | — |
| Memory updates | No | Forbidden live | — |

---

## 8. Development Approach

### Phase 1: Core Pipeline
1. Audio capture → uWS transport → Deepgram STT integration
2. Utterance finalizer with speaker tagging
3. Basic ring buffer implementation
4. Session lifecycle (start/end)

### Phase 2: State Management
1. Topic state with embedding-based clustering
2. Constraint ledger (preloaded + live)
3. Commitment ledger
4. Topic assignment logic

### Phase 3: Trigger System
1. Tier 1 deterministic filters (regex, parsers)
2. Tier 2 intent classifier integration
3. Tier 3 novelty/debounce logic
4. Tier 4 LLM integration with Zod schemas

### Phase 4: Optimizations
1. Speculative processing on partial utterances
2. Speaker-aware priority queuing
3. Streaming LLM responses
4. Predictive constraint loading

### Phase 5: Ambient UI
1. Topic indicator component
2. Constraint counter component
3. Listening heartbeat
4. Alert surfacing with proper stacking/expiry

### Phase 6: Specialized Subsystems
1. Sentiment shift detection
2. Policy guardrail system
3. Live suggestion generation
4. Silent collaborator refinement

---

## 9. Performance Budgets

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| Audio chunk → STT | 50ms | 100ms |
| Tier 1 checks | 20ms | 50ms |
| Tier 2 classification | 50ms | 100ms |
| Topic assignment | 30ms | 50ms |
| LLM call (streaming start) | 200ms | 400ms |
| LLM call (complete) | 400ms | 800ms |
| Alert render | 16ms | 32ms |

If any operation exceeds max acceptable, it is **skipped**, not queued.

---

## 10. Failure Modes

| Failure | Behavior |
|---------|----------|
| STT drops connection | Listening heartbeat disappears, auto-reconnect |
| LLM times out | Skip this evaluation, log for debugging |
| LLM returns invalid schema | Discard, don't surface |
| Topic clustering fails | Assign to "General" topic, continue |
| Speculative work mismatch | Discard, process fresh (no user impact) |

**Principle:** Failure is silent and non-destructive. User never sees errors during meeting.

---

## 11. Core Philosophy

Meeting Mode is **not** where intelligence lives.
It is where **mistakes are prevented**.

* No deep reasoning
* No long-term writes
* No creativity
* No trust without evidence

If Meeting Mode feels quiet, that's correct.
If it feels noisy, it's broken.
If it feels dead, add ambient signals — not more alerts.

---

## One-Sentence Summary

**Meeting Mode is a conservative, stateful, topic-aware real-time system that listens continuously, processes speculatively, reasons sparingly, feels alive through ambient awareness, warns rarely, and never mutates organizational memory.**
