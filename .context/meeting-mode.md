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
* **Client name list** (for information leak detection)
* **Pattern libraries** (risky language, pressure tactics, emotional indicators)
* **Prior commitments** (from previous meetings with same participants)

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
* Commitment ledger (YOU + THEM)
* **Topic completeness tracker**
* **Alert state manager** (debounce, queue, active alerts)
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

#### Commitment Ledger (tracks both YOU and THEM)

```ts
interface Commitment {
  id: string
  statement: string                // "Ship by Friday"
  normalizedStatement: string      // Canonical form for comparison: "delivery_date:friday"
  speaker: "YOU" | "THEM"
  speakerName?: string             // For THEM: "John from Acme"
  topicId: string
  type: CommitmentType
  status: "tentative" | "confirmed" | "contradicted" | "superseded"
  timestamp: number
  utteranceId: string

  // For contradiction detection
  relatedCommitments: string[]     // IDs of commitments this relates to
  contradicts?: string             // ID of commitment this contradicts
  supersedes?: string              // ID of commitment this replaces

  // Extracted structured data (when applicable)
  extractedData?: {
    deadline?: string              // ISO date if timeline commitment
    quantity?: number              // If numeric commitment
    scope?: string[]               // If scope-related
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

**Commitment Tracking Logic:**

```ts
// On each new utterance that contains a commitment:
function processCommitment(newCommitment: Commitment) {
  const relatedCommitments = findRelatedCommitments(
    newCommitment,
    commitmentLedger.filter(c => c.speaker === newCommitment.speaker)
  )

  for (const existing of relatedCommitments) {
    const relationship = analyzeRelationship(existing, newCommitment)

    if (relationship === "contradiction") {
      existing.status = "contradicted"
      newCommitment.contradicts = existing.id
      triggerSelfContradictionAlert(existing, newCommitment)
    } else if (relationship === "supersedes") {
      existing.status = "superseded"
      newCommitment.supersedes = existing.id
      // No alert - explicit update is fine
    } else if (relationship === "confirms") {
      existing.status = "confirmed"
      // No alert - confirmation is good
    }
  }

  commitmentLedger.push(newCommitment)
}
```

Commitments are tracked for the duration of the meeting. They inform:
- Self-contradiction detection
- Their-backtracking detection
- Scope creep detection
- Missing clarity checks

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
| **Risky language patterns** | Pattern library | Queue for validation |
| **Pressure tactic patterns** | Pattern library | Instant alert |
| **Emotional indicator patterns** | Pattern library | Queue for validation |
| **Client name / sensitive info** | Preloaded list match | Instant warning |

**These surface immediately.** No LLM needed.

#### Tier 2: Intent & Commitment Classification (<100ms)

* Small classifier model (local or edge)
* Labels: `commitment`, `decision`, `question`, `concern`, `risk`, `filler`, `scope_change`, `backtrack`
* **Extract commitment type** if classified as commitment
* **Extract speaker intent**: promising, requesting, confirming, refusing, hedging
* If `filler` or low confidence → stop here

#### Tier 3: Topic Novelty & Relationship Check (<50ms)

* Has this been handled in this topic already?
* Is this materially different from previous?
* **Does this relate to any existing commitment?** (embedding similarity)
* **Is this a topic shift?** (triggers completeness check on outgoing topic)
* If not novel → debounce, don't alert

#### Tier 4: LLM Validation (300-500ms, streaming)

Only reached for high-signal utterances that pass Tiers 1-3.

**Now handles 6 alert categories:**
1. Self-contradiction detection
2. Risky statement validation
3. Other party behavior analysis
4. Missing clarity detection
5. Information risk validation
6. Emotional/tone assessment

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

## 4. Live Alert System (Complete Implementation)

This section defines all alert categories, their detection mechanisms, data structures, and trigger logic.

---

### 4.0 Alert System Architecture

```ts
interface Alert {
  id: string
  category: AlertCategory
  severity: "low" | "medium" | "high" | "critical"
  triggerUtteranceId: string
  speaker: "YOU" | "THEM"
  topicId: string
  timestamp: number

  // Display
  title: string                    // Short headline: "Self-contradiction detected"
  message: string                  // Actionable message: "You said 4 days earlier, now saying 2 days"
  suggestion?: string              // Optional alternative: "Consider: 'We're revising to 2 days'"

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
  | "self_contradiction"
  | "risky_commitment"
  | "scope_creep"
  | "their_backtrack"
  | "missing_clarity"
  | "information_risk"
  | "tone_warning"
  | "pressure_detected"
  | "policy_violation"
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
  their_backtrack: 4,              // They changed terms
  pressure_detected: 5,            // You're being pressured
  risky_commitment: 6,             // Risk awareness
  scope_creep: 7,                  // Scope management
  tone_warning: 8,                 // Self-awareness
  missing_clarity: 9               // Lowest - can catch at topic end
}
```

---

### 4.1 Category 1: Self-Contradiction Alerts

**Purpose:** Alert when YOU contradict your own earlier statements in the same meeting.

#### Detection Mechanism

```
Utterance finalized (speaker = YOU)
  → Tier 2: Classify as commitment? Extract commitment type
  → Tier 3: Find related commitments in ledger (same type, same topic)
  → Tier 4: LLM evaluates if contradiction exists

LLM Prompt Template:
"Given the previous commitment: '{existing.statement}'
And the new statement: '{new.statement}'
Are these contradictory? Consider:
- Timeline conflicts (earlier date vs later date)
- Scope conflicts (included vs excluded)
- Capability conflicts (can vs cannot)
- Quantity conflicts (different numbers)
Return: { isContradiction: boolean, explanation: string, severity: string }"
```

#### Contradiction Types

| Type | Example Previous | Example New | Severity |
|------|------------------|-------------|----------|
| Timeline | "Done in 4 days" | "Done in 2 days" | Medium |
| Timeline | "By Friday" | "By next week" | High |
| Scope expand | "Just the API" | "API and frontend" | Medium |
| Scope reduce | "Full redesign" | "Minor tweaks only" | High |
| Capability flip | "We can do X" | "X isn't possible" | High |
| Quantity change | "2 developers" | "4 developers" | Medium |

#### Data Flow

```ts
interface SelfContradictionAlert extends Alert {
  category: "self_contradiction"
  originalCommitment: {
    id: string
    statement: string
    timestamp: number
    topicId: string
  }
  newStatement: string
  contradictionType: "timeline" | "scope" | "capability" | "quantity" | "general"
}
```

#### Example Alerts

| Scenario | Alert Message | Suggestion |
|----------|---------------|------------|
| Timeline shorter | "You mentioned 4 days earlier for this deliverable" | "Consider: 'We're revising the estimate to 2 days based on...'" |
| Timeline longer | "You committed to Friday, now suggesting next week" | "Consider acknowledging the change: 'Given X, we need to adjust to...'" |
| Scope expanded | "This adds frontend work to your earlier API-only commitment" | "Consider: 'To clarify, we're now including frontend as well'" |

---

### 4.2 Category 2: Risky Statement Alerts

**Purpose:** Alert when YOU say something that could backfire or weaken your position.

#### Pattern Library (Tier 1)

```ts
const RISKY_PATTERNS: PatternRule[] = [
  // Unconditional commitments
  {
    patterns: [
      /\b(definitely|absolutely|guaranteed|100%|for sure)\b.*\b(will|can|deliver)\b/i,
      /\bno problem\b/i,
      /\bof course we can\b/i,
    ],
    riskType: "unconditional_commitment",
    severity: "medium",
    suggestion: "Add conditions or caveats"
  },

  // Underestimation language
  {
    patterns: [
      /\b(easy|simple|trivial|quick|just|only)\b.*\b(change|fix|update|add)\b/i,
      /\bshouldn't take long\b/i,
      /\bpiece of cake\b/i,
    ],
    riskType: "underestimation",
    severity: "medium",
    suggestion: "Avoid minimizing complexity"
  },

  // Open-ended promises
  {
    patterns: [
      /\bwhatever (you need|it takes|comes up)\b/i,
      /\banything you want\b/i,
      /\bwe('ll| will) (handle|figure out|take care of) (everything|it all)\b/i,
    ],
    riskType: "open_ended_promise",
    severity: "high",
    suggestion: "Define boundaries"
  },

  // Authority overreach indicators
  {
    patterns: [
      /\bI('ll| will) (approve|authorize|sign off)\b/i,
      /\bI('ll| will) (waive|remove|eliminate)\b.*\b(fee|cost|charge)\b/i,
      /\bI can (promise|guarantee) (on behalf of|for the company)\b/i,
    ],
    riskType: "authority_overreach",
    severity: "high",
    suggestion: "Verify you have authority"
  },

  // Price/discount promises
  {
    patterns: [
      /\bI('ll| can) give you\b.*\b(\d+%|discount)\b/i,
      /\bwe('ll| can) (reduce|lower|cut)\b.*\b(price|cost|fee)\b/i,
    ],
    riskType: "price_commitment",
    severity: "high",
    suggestion: "Verify pricing authority"
  },

  // Blame acceptance
  {
    patterns: [
      /\b(my|our) (fault|mistake|bad)\b/i,
      /\bwe (messed up|screwed up|dropped the ball)\b/i,
      /\bI('ll| will) take (full )?responsibility\b/i,
    ],
    riskType: "blame_acceptance",
    severity: "medium",
    suggestion: "Consider neutral phrasing"
  }
]
```

#### LLM Validation (Tier 4)

For pattern matches, LLM validates context:

```ts
interface RiskyStatementLLMContext {
  utterance: string
  patternMatched: string
  riskType: string
  topicSummary: string
  recentCommitments: Commitment[]
}

// LLM determines:
// - Is this genuinely risky in context?
// - What's the actual severity?
// - What's a safer alternative?
```

#### Example Alerts

| Risky Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "No problem, we'll definitely have it by Monday" | "Unconditional commitment detected" | "Consider: 'We're targeting Monday, barring any blockers'" |
| "This is a simple change, shouldn't take long" | "Underestimation language may set wrong expectations" | "Consider: 'Let me confirm the scope before estimating'" |
| "We'll handle whatever comes up" | "Open-ended promise without boundaries" | "Consider: 'We'll handle issues within the agreed scope'" |
| "I'll approve the additional budget" | "This may require sign-off you don't have" | "Consider: 'I'll need to confirm budget approval internally'" |

---

### 4.3 Category 3: Other Party Behavior Alerts

**Purpose:** Alert when THEY say something you should catch—scope creep, backtracking, pressure tactics.

#### 4.3.1 Scope Creep Detection

```ts
interface ScopeCreepDetector {
  // Baseline: What was originally agreed
  agreedScope: ScopeItem[]         // Preloaded + confirmed in meeting

  // Detection patterns
  patterns: [
    /\bcan (you|we) also\b/i,
    /\bwhile (you're|we're) at it\b/i,
    /\b(one more|another) thing\b/i,
    /\bwhat about\b.*\b(adding|including)\b/i,
    /\bwouldn't it be (nice|great|better) (if|to)\b/i,
    /\bI (assumed|thought|expected)\b.*\bincluded\b/i,
  ]
}
```

**Detection Flow:**
```
THEM utterance contains scope pattern
  → Extract the requested addition
  → Compare against agreedScope baseline
  → If not in baseline → Scope creep alert
```

**Example Alerts:**

| Their Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "Can you also add the mobile version?" | "New scope item not in original agreement" | "Consider: 'Mobile wasn't in our original scope—let's discuss separately'" |
| "I assumed the training was included" | "They're assuming scope not previously agreed" | "Clarify what was/wasn't included" |

#### 4.3.2 Their Backtracking Detection

```ts
interface BacktrackDetector {
  // Track THEIR commitments
  theirCommitments: Commitment[]

  // Backtrack patterns
  patterns: [
    /\bactually\b.*\b(need|want|require)\b/i,
    /\bon second thought\b/i,
    /\bI (know|realize) (we|I) said\b.*\bbut\b/i,
    /\bthe (timeline|deadline|date) (needs to|has to|must)\b.*\b(change|move|shift)\b/i,
    /\bwe('re| are) going to need\b.*\b(sooner|faster|earlier)\b/i,
  ]
}
```

**Detection Flow:**
```
THEM utterance contains backtrack pattern
  → Find related prior THEM commitment
  → Confirm contradiction via LLM
  → Alert with original vs new
```

**Example Alerts:**

| Their Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "Actually, we need it by Wednesday, not Friday" | "They're changing previously agreed timeline" | "Note the change and confirm impact" |
| "I know we said $50k but the budget is now $40k" | "Budget reduced from their original commitment" | "Discuss scope adjustment for new budget" |

#### 4.3.3 Pressure Tactic Detection

```ts
const PRESSURE_PATTERNS: PatternRule[] = [
  // Social proof pressure
  {
    patterns: [
      /\beveryone else\b.*\b(does|agrees|accepts)\b/i,
      /\bother (vendors|companies|teams)\b.*\b(can|do|offer)\b/i,
      /\bstandard (practice|industry|market)\b/i,
    ],
    tacticType: "social_proof",
    alert: "Social proof pressure tactic"
  },

  // Urgency pressure
  {
    patterns: [
      /\bneed (an |your )?(answer|decision|response) (now|today|immediately)\b/i,
      /\bthis (offer|deal|price)\b.*\b(expires|ends|won't last)\b/i,
      /\bif you don't (decide|commit) (now|today)\b/i,
    ],
    tacticType: "artificial_urgency",
    alert: "Artificial urgency pressure"
  },

  // Authority pressure
  {
    patterns: [
      /\b(CEO|leadership|management|board)\b.*\b(expects|demands|requires)\b/i,
      /\bthis comes from (the top|above|leadership)\b/i,
    ],
    tacticType: "authority_pressure",
    alert: "Authority-based pressure"
  },

  // Guilt/obligation pressure
  {
    patterns: [
      /\bafter (all|everything) we('ve| have) (done|given)\b/i,
      /\byou (owe|promised)\b/i,
      /\bI thought we (had|were)\b.*\b(partners|friends|relationship)\b/i,
    ],
    tacticType: "guilt_pressure",
    alert: "Guilt/obligation pressure tactic"
  },

  // Threat pressure
  {
    patterns: [
      /\bif (you|this) (don't|doesn't)\b.*\b(we'll have to|I'll need to)\b/i,
      /\bwe('ll| will) (have to|need to)\b.*\b(reconsider|look elsewhere|find another)\b/i,
    ],
    tacticType: "implicit_threat",
    alert: "Implicit threat detected"
  }
]
```

**Example Alerts:**

| Their Statement | Alert Message | Suggestion |
|-----------------|---------------|------------|
| "Everyone else in the industry does this" | "Social proof pressure tactic detected" | "Their comparison may not apply to your situation" |
| "We need your answer by end of day" | "Artificial urgency—take time to decide" | "Consider: 'I'll give you a considered response by X'" |
| "After everything we've done for you..." | "Guilt pressure tactic detected" | "Focus on the current terms, not obligations" |

---

### 4.4 Category 4: Missing Clarity Alerts

**Purpose:** Alert when important details are left ambiguous or undefined.

#### Trigger: Topic Shift Detection

When conversation shifts to a new topic, evaluate the **outgoing topic** for completeness.

```ts
interface TopicCompletenessCheck {
  topicId: string
  topicLabel: string

  checks: {
    // Owner check
    ownerMissing: boolean          // No one assigned
    ownerVague: boolean            // "Someone should..." "We need to..."

    // Deadline check
    deadlineMissing: boolean       // No date mentioned
    deadlineVague: boolean         // "Soon", "ASAP", "when possible"

    // Action items check
    noActionItems: boolean         // Topic discussed, nothing to do?
    actionItemsVague: boolean      // "Look into it", "Think about it"

    // Confirmation check
    noMutualConfirmation: boolean  // One-sided agreement only
    vagueConfirmation: boolean     // "Sounds good", "I guess", "Maybe"
  }
}
```

#### Detection Patterns

```ts
const CLARITY_PATTERNS = {
  vagueOwnership: [
    /\bsomeone (should|needs to|has to)\b/i,
    /\bwe (need|should|have) to\b/i,        // No specific "I" or name
    /\bit (needs|should|has) to be done\b/i,
  ],

  vagueTimeline: [
    /\b(soon|asap|when (possible|you can)|eventually)\b/i,
    /\b(sometime|at some point|later)\b/i,
    /\bnot (sure|certain) when\b/i,
  ],

  vagueConfirmation: [
    /\b(sounds? (good|fine|ok)|I guess|maybe|probably|I think so)\b/i,
    /\b(we('ll| will) see|let's see|TBD)\b/i,
    /\b(sure|ok|yeah)\b$/i,                 // Just "sure" or "ok" without elaboration
  ],

  vagueActionItems: [
    /\b(look into|think about|consider|explore)\b/i,
    /\b(circle back|revisit|discuss later)\b/i,
    /\b(figure (it )?out|work on it)\b/i,
  ]
}
```

#### Alert Timing

```ts
// On topic shift:
function onTopicShift(outgoingTopic: TopicState, incomingTopic: TopicState) {
  const completeness = evaluateCompleteness(outgoingTopic)

  // Only alert on significant topics (not small talk)
  if (outgoingTopic.commitmentsMentioned.length === 0 &&
      outgoingTopic.riskFlags.length === 0) {
    return // Skip trivial topics
  }

  const missingItems: string[] = []

  if (completeness.checks.ownerMissing || completeness.checks.ownerVague) {
    missingItems.push("owner")
  }
  if (completeness.checks.deadlineMissing || completeness.checks.deadlineVague) {
    missingItems.push("deadline")
  }
  if (completeness.checks.noActionItems || completeness.checks.actionItemsVague) {
    missingItems.push("next steps")
  }
  if (completeness.checks.noMutualConfirmation || completeness.checks.vagueConfirmation) {
    missingItems.push("explicit confirmation")
  }

  if (missingItems.length > 0) {
    triggerMissingClarityAlert(outgoingTopic, missingItems)
  }
}
```

#### Example Alerts

| Situation | Alert Message | Suggestion |
|-----------|---------------|------------|
| Topic ends without owner | "No owner assigned for: API integration" | "Consider asking: 'Who will own this?'" |
| Vague timeline | "Timeline unclear for: Payment feature" | "Consider: 'Can we set a target date?'" |
| No action items | "No next steps defined for: Security review" | "Consider: 'What are our action items?'" |
| Vague confirmation | "Their confirmation was vague on: Pricing" | "Consider getting explicit agreement" |

---

### 4.5 Category 5: Information Risk Alerts

**Purpose:** Alert when sensitive or confidential information may be leaked.

#### Preloaded Context Required

```ts
interface InformationRiskContext {
  // Client/company names that shouldn't be mentioned
  protectedClientNames: string[]   // ["Acme Corp", "BigCo", "ClientX"]

  // Forbidden disclosure patterns
  forbiddenPatterns: PatternRule[]

  // Financial sensitivity
  financialTerms: string[]         // ["margin", "cost basis", "internal rate"]

  // Technical sensitivity
  technicalSecrets: string[]       // ["API key", "password", "secret"]

  // Roadmap/strategy
  unreleasedFeatures: string[]     // Features not yet public
  strategyTerms: string[]          // ["acquisition", "pivot", "layoff"]
}
```

#### Pattern Categories

```ts
const INFO_RISK_PATTERNS = {
  clientNameDrop: {
    // Dynamically built from preloaded client list
    detection: "exact match or fuzzy match against client names",
    severity: "high",
    alert: "Client name mentioned—verify NDA allows"
  },

  financialDisclosure: {
    patterns: [
      /\b(our|my) (margin|markup|cost|profit)\b.*\b(\d+%?|\$\d+)\b/i,
      /\bwe (charge|pay|make)\b.*\b\$\d+/i,
      /\binternal (rate|cost|price)\b/i,
      /\bour (revenue|ARR|MRR|burn rate)\b/i,
    ],
    severity: "high",
    alert: "Internal financial data mentioned"
  },

  roadmapLeak: {
    patterns: [
      /\bwe('re| are) (planning|going|about) to (build|launch|release)\b/i,
      /\bupcoming (feature|release|version)\b/i,
      /\bnext (quarter|year|month) we('ll| will)\b/i,
      /\bunannounced\b/i,
    ],
    severity: "medium",
    alert: "Unreleased roadmap item mentioned"
  },

  technicalSecrets: {
    patterns: [
      /\b(API key|access key|secret key|password|token)\b/i,
      /\b[A-Za-z0-9]{32,}\b/,        // Long alphanumeric (potential key)
      /\bssh-rsa\b/i,
      /\bBEGIN (RSA |PRIVATE )?KEY\b/i,
    ],
    severity: "critical",
    alert: "Technical secret/credential mentioned"
  },

  strategyLeak: {
    patterns: [
      /\b(acquisition|acquiring|being acquired)\b/i,
      /\b(layoff|downsizing|restructuring)\b/i,
      /\bpivot(ing)? to\b/i,
      /\b(shut(ting)? down|sunsetting|deprecating)\b.*\b(product|service|feature)\b/i,
    ],
    severity: "critical",
    alert: "Strategic/sensitive information mentioned"
  },

  thirdPartyInfo: {
    patterns: [
      /\b(they|[A-Z][a-z]+ (Corp|Inc|LLC|Ltd))\b.*\b(told us|shared|said)\b.*\b(confidential|secret|internal)\b/i,
      /\bdon't tell (them|anyone) (I|we) told you\b/i,
    ],
    severity: "high",
    alert: "Third-party confidential info mentioned"
  }
}
```

#### Example Alerts

| Statement | Alert Message | Suggestion |
|-----------|---------------|------------|
| "We did something similar for Acme Corp" | "Client name 'Acme Corp' mentioned—check NDA" | "Consider: 'We've done similar work for other clients'" |
| "Our margin on this is about 40%" | "Internal financial data disclosed" | "Avoid sharing internal margins" |
| "We're planning to launch AI features next quarter" | "Unreleased roadmap item mentioned" | "Check if this is public information" |
| "Here's the API key: sk-abc123..." | "Technical credential detected!" | "Never share credentials verbally" |

---

### 4.6 Category 6: Emotional/Tone Alerts

**Purpose:** Alert when YOUR tone may be counterproductive—defensive, over-apologetic, or reactive.

#### Pattern Library

```ts
const TONE_PATTERNS = {
  defensive: {
    patterns: [
      /\bthat's not (my|our) (fault|problem|responsibility)\b/i,
      /\bI (already|just) (said|told you|explained)\b/i,
      /\bwe (already|did) (do|did) that\b/i,
      /\bthat's not what I (said|meant)\b/i,
      /\byou('re| are) not (listening|understanding)\b/i,
      /\bwith all due respect\b/i,
    ],
    toneType: "defensive",
    severity: "medium",
    alert: "Defensive tone detected"
  },

  overApologetic: {
    patterns: [
      /\b(sorry|apologi[zs]e)\b.*\b(sorry|apologi[zs]e)\b/i,  // Multiple apologies
      /\bI('m| am) (so |really |very )?sorry\b.*\bI('m| am) (so |really |very )?sorry\b/i,
      /\bI know (I|we) (messed|screwed) up\b/i,
      /\bit's (all )?(my|our) fault\b/i,
      /\bI feel (terrible|awful|bad) about\b/i,
    ],
    toneType: "over_apologetic",
    severity: "low",
    alert: "Excessive apology may weaken position"
  },

  reactive: {
    // Detected via timing + pattern
    indicators: [
      "Immediate response after their criticism",
      "Raised voice indicators (ALL CAPS, exclamations)",
      "Interruption patterns"
    ],
    patterns: [
      /\bno[,!]+ (that's|you're) (wrong|incorrect|not true)\b/i,
      /\babsolutely not\b/i,
      /\bthat's (ridiculous|absurd|crazy)\b/i,
    ],
    toneType: "reactive",
    severity: "medium",
    alert: "Reactive response—consider pausing"
  },

  dismissive: {
    patterns: [
      /\bthat's (not|never going to) (important|relevant|going to work)\b/i,
      /\bwhatever\b/i,
      /\bI don't (care|see why)\b/i,
      /\bthat doesn't matter\b/i,
    ],
    toneType: "dismissive",
    severity: "medium",
    alert: "Dismissive tone detected"
  },

  frustrated: {
    patterns: [
      /\b(again|once more|for the (nth|hundredth) time)\b/i,
      /\bI('ve| have) (already|just) (said|explained|told you)\b/i,
      /\bhow many times\b/i,
      /\bI don't (understand|know) (why|how) (this|you)\b/i,
    ],
    toneType: "frustrated",
    severity: "low",
    alert: "Frustration showing—consider reframing"
  }
}
```

#### Contextual LLM Validation

Pattern matches are validated by LLM for context:

```ts
interface ToneValidationContext {
  utterance: string
  patternMatched: string
  recentTheirUtterances: string[]  // What prompted this response?
  topicContext: string

  // LLM evaluates:
  // - Is this genuinely problematic tone?
  // - Is the reaction justified?
  // - What's a better alternative?
}
```

#### Example Alerts

| Your Statement | Alert Message | Suggestion |
|----------------|---------------|------------|
| "That's not our fault, we delivered on time" | "Defensive tone—consider reframing" | "Consider: 'Let's look at the timeline together'" |
| "I'm so sorry, I'm really sorry about this..." | "Excessive apology may weaken your position" | "One clear apology is sufficient" |
| "No, that's completely wrong!" | "Reactive response—take a breath" | "Consider: 'I see it differently—here's why...'" |
| "I've already explained this three times" | "Frustration showing" | "Consider: 'Let me try explaining it another way'" |

---

### 4.7 Alert Rendering & UX Rules

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
│ ⚠️ CRITICAL: Technical credential   │ ← Red border, bold
│ API key detected in speech          │
│ [Dismiss]                           │
├─────────────────────────────────────┤
│ 🔄 Self-contradiction               │ ← Yellow border
│ You said 4 days earlier             │
│ Suggestion: Acknowledge the change  │
│                          [Dismiss]  │
└─────────────────────────────────────┘
```

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

### 4.8 Silent Collaborator Mode (Default Behavior)

All alerts follow **Silent Collaborator** principles:

* No proactive speaking or chatty responses
* Only surfaces high-signal events
* Alerts are suggestions, never commands
* User maintains full control

**Category Filtering by Mode:**

```ts
const SILENT_COLLABORATOR_THRESHOLDS: Record<AlertCategory, number> = {
  policy_violation: 0.6,           // Lower threshold - always show
  information_risk: 0.7,
  self_contradiction: 0.75,
  their_backtrack: 0.75,
  pressure_detected: 0.7,
  risky_commitment: 0.8,
  scope_creep: 0.8,
  tone_warning: 0.85,              // Higher threshold - only clear cases
  missing_clarity: 0.85
}
```

Only alerts exceeding their category's confidence threshold are surfaced.

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
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MEETING SESSION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Preloaded Context (read-only)                                              │
│  ├── Org constraints                                                        │
│  ├── Policy guardrails                                                      │
│  ├── Open decisions                                                         │
│  ├── Predicted topic constraints (pre-embedded)                             │
│  ├── Client name list (for info leak detection)                             │
│  ├── Pattern libraries                                                      │
│  │   ├── Risky language patterns                                            │
│  │   ├── Pressure tactic patterns                                           │
│  │   ├── Emotional indicator patterns                                       │
│  │   ├── Scope creep patterns                                               │
│  │   ├── Vague language patterns                                            │
│  │   └── Information risk patterns                                          │
│  └── Prior commitments (from previous meetings)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Live State (mutable during meeting)                                        │
│  ├── Topic State Map                                                        │
│  │   └── TopicState[]                                                       │
│  │       ├── Topic metadata (id, label, summary, centroid)                  │
│  │       └── Completeness tracking (owner, deadline, actions, confirmation) │
│  ├── Constraint Ledger                                                      │
│  │   └── Constraint[] (preloaded + meeting-discovered)                      │
│  ├── Commitment Ledger                                                      │
│  │   └── Commitment[]                                                       │
│  │       ├── YOUR commitments (with contradiction tracking)                 │
│  │       └── THEIR commitments (for backtrack detection)                    │
│  ├── Ring Buffer                                                            │
│  │   └── Recent utterances (60-120 seconds)                                 │
│  ├── Speculative Cache                                                      │
│  │   └── Pre-computed results for partial utterances                        │
│  └── Alert State Manager                                                    │
│      ├── Active alerts (max 2 visible)                                      │
│      ├── Pending queue (priority-ordered)                                   │
│      └── Recently shown (for deduplication)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Alert Categories (6 types)                                                 │
│  ├── Self-contradiction alerts                                              │
│  ├── Risky statement alerts                                                 │
│  ├── Other party behavior alerts (scope creep, backtrack, pressure)         │
│  ├── Missing clarity alerts                                                 │
│  ├── Information risk alerts                                                │
│  └── Emotional/tone alerts                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Ambient UI State                                                           │
│  ├── Current topic label                                                    │
│  ├── Constraint count                                                       │
│  ├── Listening status                                                       │
│  └── Alert overlay (0-2 alerts visible)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Feature → Meeting Mode Mapping

| Feature | In Meeting Mode? | How | Latency |
|---------|------------------|-----|---------|
| **Self-contradiction detection** | Yes | Commitment Ledger + LLM comparison | 300-500ms |
| **Risky statement alerts** | Yes | Pattern library + LLM validation | 50-500ms |
| **Scope creep detection** | Yes | Baseline comparison + patterns | 100-300ms |
| **Their backtrack detection** | Yes | Their Commitment tracking + LLM | 300-500ms |
| **Pressure tactic detection** | Yes | Pattern library (Tier 1) | <50ms |
| **Missing clarity alerts** | Yes | Topic completeness check on shift | <100ms |
| **Information risk alerts** | Yes | Client list + pattern matching | <50ms |
| **Emotional/tone alerts** | Yes | Pattern library + LLM validation | 50-500ms |
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
3. Commitment ledger (YOUR commitments)
4. Topic assignment logic
5. **Topic completeness tracking structure**

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

### Phase 6: Live Alert System - Self & Risky Detection
1. **Pattern library infrastructure** (loadable, configurable)
2. **Risky statement patterns** (unconditional, underestimation, open-ended, authority)
3. **Self-contradiction detection**
   - Commitment extraction from utterances
   - Related commitment matching (embedding similarity)
   - Contradiction analysis via LLM
4. **Alert queue manager** (priority, deduplication, expiry)
5. **Alert UI components** (overlay, dismiss, stack behavior)

### Phase 7: Live Alert System - Other Party Detection
1. **THEIR commitment tracking** in Commitment Ledger
2. **Scope creep detection**
   - Baseline scope tracking
   - Scope addition pattern matching
   - Comparison against agreed scope
3. **Their backtrack detection**
   - Monitor THEIR commitments for changes
   - Backtrack pattern recognition
4. **Pressure tactic detection**
   - Social proof patterns
   - Artificial urgency patterns
   - Authority/guilt pressure patterns
   - Implicit threat patterns

### Phase 8: Live Alert System - Clarity & Risk Detection
1. **Missing clarity detection**
   - Topic shift detection trigger
   - Completeness evaluation (owner, deadline, actions, confirmation)
   - Vague language pattern detection
2. **Information risk detection**
   - Client name list preloading
   - Financial disclosure patterns
   - Roadmap/strategy leak patterns
   - Technical secret detection
3. **Emotional/tone detection**
   - Defensive tone patterns
   - Over-apologetic patterns
   - Reactive/dismissive patterns
   - LLM contextual validation

### Phase 9: Alert System Refinement
1. Confidence threshold tuning per category
2. Cross-category deduplication
3. Alert priority balancing
4. Silent collaborator mode integration
5. User preference settings (enable/disable categories)
6. Alert analytics and feedback loop

### Phase 10: Integration & Polish
1. End-to-end testing of all 6 alert categories
2. Performance optimization (meet latency budgets)
3. Edge case handling
4. User testing and refinement
5. Documentation and training materials

---

## 9. Performance Budgets

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| Audio chunk → STT | 50ms | 100ms |
| Tier 1 checks (patterns) | 20ms | 50ms |
| Tier 2 classification | 50ms | 100ms |
| Tier 3 relationship check | 30ms | 50ms |
| Topic assignment | 30ms | 50ms |
| Commitment extraction | 50ms | 100ms |
| Related commitment search | 30ms | 50ms |
| LLM call (streaming start) | 200ms | 400ms |
| LLM call (complete) | 400ms | 800ms |
| Alert render | 16ms | 32ms |
| Topic completeness check | 20ms | 50ms |

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
| Commitment extraction fails | Log, continue without tracking this commitment |
| Contradiction detection fails | Skip alert, don't surface false positive |
| Pattern library load fails | Fall back to hardcoded essential patterns |
| Alert queue overflow | Drop lowest priority alerts |
| Client name list unavailable | Disable info risk detection for client names |

**Principle:** Failure is silent and non-destructive. User never sees errors during meeting.

---

## 11. Core Philosophy

Meeting Mode is **not** where intelligence lives.
It is where **mistakes are prevented**.

* No deep reasoning
* No long-term writes
* No creativity
* No trust without evidence

**Alert Philosophy:**
* Self-awareness over self-righteousness — help user catch their own missteps
* Protection over perfection — better to miss an edge case than cry wolf
* Suggestion over instruction — alerts inform, never command
* Context over rules — patterns trigger investigation, LLM confirms

If Meeting Mode feels quiet, that's correct.
If it feels noisy, it's broken.
If it feels dead, add ambient signals — not more alerts.

---

## One-Sentence Summary

**Meeting Mode is a conservative, stateful, topic-aware real-time system that listens continuously, tracks commitments from both parties, detects self-contradictions and risky statements, warns about scope creep and pressure tactics, surfaces missing clarity, prevents information leaks, monitors emotional tone, reasons sparingly through tiered evaluation, and never mutates organizational memory.**
