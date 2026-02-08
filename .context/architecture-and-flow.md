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

Larity is a **Tauri + React desktop app** that connects to a **shared remote server** for all meeting processing. This is a key architectural decision — processing does NOT run locally on any user's machine.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Larity Desktop  │     │  Larity Desktop  │     │  Larity Desktop  │
│  (Host — Rahul)  │     │  (Team — Priya)  │     │  (Team — Raj)    │
│                  │     │                  │     │                  │
│  Tauri + React   │     │  Tauri + React   │     │  Tauri + React   │
│  Captures audio  │     │  View-only       │     │  View-only       │
│  from Meet tab   │     │  (no audio send) │     │  (no audio send) │
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
              │  │  Tier3 → Tier4                    │  │
              │  └──────┬──────────────────────────┘  │
              │         │                              │
              │  ┌──────▼──────┐  ┌────────────────┐  │
              │  │  Redis       │  │  Python        │  │
              │  │  (sessions,  │  │  Microservice  │  │
              │  │   ledgers,   │  │  (voice        │  │
              │  │   pub/sub)   │  │   embeddings)  │  │
              │  └─────────────┘  └────────────────┘  │
              └────────────────────────────────────────┘
```

**Why remote server, not local Tauri-spawned:**
- Multi-user sessions require shared state accessible to all team members
- Alert routing (shared + personal channels) needs centralized pub/sub
- Voice embedding service (Python) is heavy for local machines
- Consistent processing regardless of host machine specs
- Single Deepgram connection managed server-side

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
* **LLM Usage (Vercel AI SDK):**
    * **Narrow prompts:** Pre-meeting brief, Role-specific talking points, Known risks, Open questions
* **Output:** Read-only artifacts shown in UI. **Not written as "memory" yet.**

---

## PART III — LIVE MEETING MODE (CORE DIFFERENTIATOR)

> **Complete Specification:** See [meeting-mode.md](./meeting-mode.md) for full details on multi-user sessions, voice identification, tiered pipeline, and alert system.

### 5. Meeting Session — Multi-User Join Flow

This is NOT a single-user experience. Multiple team members share a session.

#### 5.1 Host Starts Session
* **User Action:** Host opens Google Meet, Larity extension detects meeting context, host clicks "Start Meeting Mode"
* **What Happens:**
    1. `POST /meeting-session/start` → creates `meetingSession` record on remote server
    2. **Context Preload** (critical): Open decisions, known constraints, active policy guardrails, unresolved risks, org-level rules, **team voiceprints** loaded into memory, **org keyword blocklists**, **prior commitments** from previous meetings with this client, **calendar agenda items**
    3. **Predictive Constraint Pre-embedding**: Parse agenda, identify likely topics, pre-embed constraint matches
    4. **Buffers Initialized**: Ring buffer (~2 min), topic state map, constraint ledger, **commitment ledger (Redis, entire meeting)**, speaker state trackers, alert state manager
    5. Audio pipeline armed — host's Google Meet tab audio captured and sent to server via WebSocket
    6. Deepgram connection opened with `diarize=true`
    7. Voice embedding service ready with pre-loaded team voiceprints
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
* **Host Side:** Google Meet tab audio captured → Chunked (20-100ms) → Binary frames sent to remote uWS server via WebSocket
* **uWS Responsibilities:** Forward audio to Deepgram (with diarization). Maintain live session. **No logic, no AI.**
* **Team members:** Do NOT send tab audio. They see processed results.

### 7. Streaming STT with Diarization
* **Deepgram Output:** Partial hypotheses with speaker indices → Corrections → Final segments with speaker attribution
* **Diarization:** Deepgram assigns speaker indices (0, 1, 2, ...) — these are arbitrary integers, not identities
* *Note: Raw STT output is not LLM-safe.*

### 7.1 Speaker Identification (Voice Embeddings)

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#3-speaker-identification-via-voice-embeddings)

* **Python microservice** extracts voice embeddings from each diarized speaker's audio segments
* Embeddings compared against **pre-loaded team voiceprints** via cosine similarity
* Matched → TEAM (with userId) | Unmatched → EXTERNAL (client)
* External speaker names from calendar data (best-effort)
* **No voiceprint storage for external speakers**
* First 30-60 seconds: unidentified speakers default to EXTERNAL (conservative)
* Once identified: buffered utterances **retroactively reprocessed** with correct speaker identity

**Speaker Identity Model:**
```ts
interface SpeakerIdentity {
  speakerId: string               // Unique within session
  type: "TEAM" | "EXTERNAL"
  userId?: string                 // If TEAM, linked to User
  name: string
  diarizationIndex?: number       // Deepgram's speaker integer
  isCurrentUser: boolean          // Is this the viewer of this Larity instance?
  confidence: number              // Identification confidence (0-1)
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

#### Pre-filter (Free, <10ms)
* Kill noise: <3 words, pure acknowledgments, exact duplicates
* **Kills ~30-40% of utterances**

#### Tier 1: Structural Detection (Free, <50ms)
* **Language-agnostic ONLY**: date/time extraction, number extraction, org keyword blocklist matches, technical patterns (API keys, hashes, credentials)
* **Accelerator, NOT a gate** — fires instant alerts but everything passes through to Tier 2

#### Tier 2: Small LLM Classification (~$0.002/call, <200ms)
* **Single call to GPT-4o-mini** per utterance
* Input: utterance + speaker identity + last 2-3 utterances from same speaker (cross-utterance context)
* **Replaces ALL old regex pattern libraries** (risky language, pressure tactics, tone, scope creep, backtracking, vague language)
* Returns: intent, commitmentType, tone, riskSignals, extractedData, confidence
* Gate: filler/general with high confidence → STOP. Commitment/decision → write to commitment ledger
* **Works in ANY language natively**

#### Tier 3: Embedding Search + Novelty Check (~$0.00002/call, <100ms)
* Runs on **EVERY utterance** (safety net — catches what Tier 2 might miss)
* Three parallel checks:
    * **Novelty check**: semantic deduplication within meeting
    * **Memory search**: pgvector search for past decisions, commitments, policies (client-scoped + org-wide)
    * **Commitment ledger search**: compare against ALL commitments from THIS meeting (catches contradictions from 40 min ago)
* If match found → **force Tier 4** regardless of Tier 2 label

#### Tier 4: Deep LLM Reasoning (~$0.02/call, 300-500ms)
* **Large model (GPT-4o, Claude Sonnet via OpenRouter)**
* Only for high-signal utterances (~5-10% of total, ~8 calls per meeting)
* Rich context: utterance + speaker identity + topic summary + ring buffer + Tier 3 matches (historical + commitment ledger) + relevant constraints
* Returns: alert type, severity, message, suggestion, routing (shared/personal/both)
* Zod-enforced output schema

#### Three Model Tiers

| Model | Purpose | Cost/call | Example |
|-------|---------|-----------|---------|
| **Embedding** | Search, similarity, novelty | ~$0.00002 | text-embedding-3-small |
| **Small LLM** | Classification, extraction | ~$0.002 | GPT-4o-mini, Haiku |
| **Large LLM** | Deep reasoning | ~$0.02 | GPT-4o, Claude Sonnet |

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
| **Commitment ledger** | Commitments & decisions | Entire meeting | Intra-meeting contradictions | Redis |
| **pgvector** | Historical memory | All past meetings | Org memory contradictions | PostgreSQL |

* **Commitment ledger** is written LIVE by Tier 2 whenever it classifies a commitment/decision
* Stores embedding vectors per commitment for Tier 3 similarity search
* Status evolves: tentative → confirmed → contradicted → superseded
* At meeting end: exported to PostgreSQL + pgvector (becomes organizational memory)

### 11. Topic & State Tracking
* **Topic State:** Each utterance embedded, compared against topic centroids, assigned to existing or new topic
* **Constraint Ledger:** Tracks explicit facts (dates, capacity, policy, dependencies) from preloaded data + meeting
* **Speaker State Tracker:** Rolling tone scores per speaker, engagement metrics, response patterns
    * Detects gradual tone shifts (escalation over 15 min)
    * Detects client disengagement (brief responses, declining frequency)
* **State Persistence:** All ledgers in Redis per session, accessible to all participants

### 12. Live LLM Invocation (Read-Only, Streaming)
* **LLM Characteristics:**
    * Tier 2: Small, fast model (GPT-4o-mini) for classification — every utterance
    * Tier 4: Large model (GPT-4o/Sonnet via OpenRouter) for reasoning — ~8 calls/meeting
* **Context for Tier 4:** Known constraints, recent commitments, topic summary, utterance, speaker identity, Tier 3 matches (historical + commitment ledger). **No full transcript.**
* **Structure:** Zod-enforced output schemas (Vercel AI SDK)
* **Streaming Pattern:** Progressive feedback (200ms checking indicator, 300ms preliminary alert, 400ms final)
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
* **Exit Triggers:** Host clicks "End Meeting", Meet tab closes, inactivity timeout, all participants disconnect
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
* **LLM:** Answers via Vercel AI SDK
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

> **Final Summary:** Larity is a real-time multi-user meeting intelligence system where a host captures shared audio, speakers are identified through voice embeddings, utterances flow through a four-tier processing pipeline (structural → small LLM → embedding search → large LLM), commitments are tracked in a live ledger across the entire meeting, alerts are routed to shared and personal channels across all connected team members, classification is language-agnostic by design, and organizational memory is only written after the meeting ends with full evidence chains.
