# LARITY — FULL USER FLOW & ARCHITECTURE

*Chronological order of system behavior.*

**Reference Documents:**
- [meeting-mode.md](./meeting-mode.md) — Complete meeting mode specification (triggers, ledgers, ambient UI, alert system)
- [timeline.md](./timeline.md) — 6-week development timeline with implementation details

---

## 0. High-Level Mental Model
Larity operates in three hard-separated modes. **No data, logic, or permissions leak across these modes.**

1.  **Live Meeting Mode** → Fast, read-only, ephemeral. *(See [meeting-mode.md](./meeting-mode.md) for complete spec)*
2.  **Post-Meeting Mode** → Slow, authoritative, write-heavy.
3.  **Assistant / Chatbox Mode** → Query + explicit actions.

---

## PART I — APP BOOT & IDLE STATE

### 1. App Launch
**What Happens:** User opens Larity.
* **Tauri:**
    * Creates native window.
    * Requests OS permissions (audio, mic).
    * Spawns two local processes:
        1.  `uWebSockets.js` (Real-time plane).
        2.  `Elysia` (Control plane).

**Why:**
* Zero cold-start during meetings.
* Predictable latency.
* Clear responsibility boundaries.

### 2. Frontend Initialization
**React App:**
* Connects to **Elysia** via HTTP (REST).
* Connects to **uWS** via persistent WebSocket.
* **Loads:** User profile, Org context, Assigned clients, Permissions, Upcoming meetings.

**Data Sources:**
* PostgreSQL (via Elysia) — client-scoped queries.
* Cached state (Redis).

---

## PART II — PRE-MEETING FLOW (AUTONOMOUS PREP)

### 3. Calendar-Driven Trigger
* **Trigger:** Meeting scheduled within threshold (e.g., T–15 min).
* **Elysia Actions:**
    * **Fetch:** Calendar details (Google/Outlook), Participants, Agenda.
    * **Resolve Client:** Map meeting to Client (tenant).
    * **Pull Historical Context (client-scoped):** Previous meetings, Open decisions, Open questions, Important points, Tasks, Deadlines, PolicyGuardrails.

### 4. Pre-Meeting Intelligence
* **Processing:**
    * Relevant data embedded (`pgvector`).
    * Graph traversal for relationships.
    * Context assembled deterministically.
* **LLM Usage (Vercel AI SDK):**
    * **Narrow prompts:** Pre-meeting brief, Role-specific talking points, Known risks, Open questions.
* **Output:** Read-only artifacts shown in UI. **Not written as “memory” yet.**

---

## PART III — LIVE MEETING MODE (CORE DIFFERENTIATOR)

> **Complete Specification:** See [meeting-mode.md](./meeting-mode.md) for full details on triggers, ledgers, ambient UI, and alert system.

### 5. Meeting Join & Initialization
* **User Action:** User opens Google Meet, Larity extension detects meeting context, user clicks "Start Meeting Mode".
* **Initialization Sequence:**
    1.  Session creation via `/session/start` → `meetingSession` record created.
    2.  **Context Preload** (critical): Open decisions, known constraints, active policy guardrails, unresolved risks, org-level rules.
    3.  **Predictive Constraint Pre-embedding**: Parse agenda, identify likely topics, pre-embed constraint matches.
    4.  **Buffers Initialized**: Ring buffer, topic state map, constraint ledger, commitment ledger.
    5.  Audio pipelines armed (mic + tab audio).
    6.  Ambient UI activated.
* **System State Change:**
    * Live mode flag enabled.
    * **Memory writes disabled.**
    * LLM scope restricted.

### 6. Audio Capture & Transport
* **Client Side:** System audio + mic captured → Chunked (20–100ms) → Binary frames sent to `uWS`.
* **uWS Responsibilities:** Forward audio to Deepgram. Maintain live session. **No logic, no AI.**

### 7. Streaming STT Reality
* **Deepgram Output:** Partial hypotheses → Corrections → Final segments.
* *Note: This raw output is not LLM-safe.*

### 7.1 Speculative Processing (Latency Optimization)
* **On Partial Hypotheses (confidence > 0.7):**
    * Start intent classification speculatively.
    * Identify likely topic from partial text.
    * Pre-fetch relevant constraints for that topic.
    * Pre-warm LLM connection if high-signal keywords detected.
* **On Final:** If text matches speculation → use pre-computed results (200-300ms saved).
* **Success Rate:** ~85% of speculative work is usable.

### 8. STT Normalization Layer
* **Component:** Utterance Finalizer (pure logic).
* **Actions:** Drop non-final segments, merge short utterances, add light punctuation, attach speaker + timestamp.
* **Output:**
    ```json
    {
      "speaker": "YOU",
      "text": "I think we can ship by Friday.",
      "ts": 1730000004
    }
    ```
* **Constraint:** Only these normalized objects move forward.

### 9. Trigger System (Tiered, Speed-Optimized)

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#35-trigger-evaluation-tiered-speed-optimized)

* **Tier 1: Deterministic Fast Path (<50ms)**
    * Policy keyword regex, date/deadline parser, forbidden terms, scope change patterns.
    * **Surfaces immediately. No LLM needed.**
* **Tier 2: Intent Classification (<100ms)**
    * Small classifier model. Labels: `commitment`, `decision`, `question`, `concern`, `risk`, `filler`.
    * If `filler` or low confidence → stop here.
* **Tier 3: Topic Novelty Check (<50ms)**
    * Debounce logic, material difference detection, repetition suppression.
* **Tier 4: LLM Validation (300-500ms, streaming)**
    * Only reached for high-signal utterances that pass Tiers 1-3.
* **Outcome:** ~90% utterances dropped. Only triggered utterances proceed.
* **Protects:** Cost, Latency, Stability, Correctness.

### 9.1 Speaker-Aware Processing
* **YOUR speech:** Parallel tier processing, lower confidence threshold (0.7), priority queue for LLM.
* **THEIR speech:** Sequential processing, higher threshold (0.85), standard queue.
* *Responsiveness when it matters most.*

### 10. Topic & State Tracking

* **Topic State:** Each utterance is embedded, compared against topic centroids, assigned to existing or new topic.
* **Constraint Ledger:** Tracks explicit facts (dates, capacity, policy, dependencies, legal) from preloaded data and meeting.
* **Commitment Ledger:** Tracks provisional commitments with status (tentative, confirmed, contradicted).
* **State Persistence:** All ledgers persisted in Redis per session.

### 11. Short-Term Context Assembly
* **Context Source:** Ring buffer (last 60–120 seconds).
* **Filter:** Same topic, relevant speakers only.
* **Payload:** Tiny, bounded, predictable.
* **Constraint:** **No long-term memory. No vector search.**

### 12. Live LLM Invocation (Read-Only, Streaming)
* **LLM Characteristics:** Small, fast model (OpenRouter) with fixed prompt.
* **Context:** Known constraints, recent commitments, topic summary, new statement, speaker role. **No full transcript.**
* **Structure:** Zod-enforced output schema (Vercel AI SDK).
* **Task:** Evaluate risk, Flag contradiction, Suggest safer phrasing, Detect policy breach.
* **Streaming Pattern:** Progressive feedback (200ms checking indicator, 300ms preliminary alert, 400ms final).
* **Output:** Ephemeral hint. Optional UI surfacing. **No persistence.**
* *Note: If slow or wrong → silently skipped.*

### 13. Ambient Awareness Layer

> **Full Details:** See [meeting-mode.md](./meeting-mode.md#38-ambient-awareness-layer)

Non-intrusive signals that prove the system is alive:
* **Topic Indicator:** Shows current detected topic label, updates on topic shift.
* **Constraint Counter:** Shows tracked constraints count, increments on new detection.
* **Listening Heartbeat:** Visual confirmation audio is being processed.
* **These are NOT alerts.** They're ambient proof of awareness.

### 14. Alert Surfacing Rules
* **Short** — one sentence, actionable.
* **Contextual** — reference what was just said.
* **Dismissible** — swipe or click to dismiss.
* **Auto-expire** — fade after 10-15 seconds.
* **Non-stacking** — max 2 visible at once, queue the rest.

| Type | Source | Latency | Example |
|------|--------|---------|---------|
| Policy warning | Tier 1 regex | <50ms | "NDA term mentioned" |
| Date flagged | Tier 1 parser | <50ms | "Deadline: Friday noted" |
| Risk detected | Tier 4 LLM | 300-500ms | "This may conflict with QA capacity constraint" |
| Suggestion | Tier 4 LLM | 300-500ms | "Consider: 'We're targeting Friday pending QA'" |

### 15. Silent Collaborator Behavior
* No interruption. No narration. No spam.
* **Surfaces only high-signal events.**
* *This is by mechanical design, not tuning.*

---

## PART IV — POST-MEETING MODE (AUTHORITATIVE)

> **Implementation Timeline:** See [timeline.md](./timeline.md#week-5-post-meeting-pipeline)

### 16. Meeting Ends
* **State Transition:** Live mode off. **Memory writes enabled.** Async processing begins.

### 17. Transcript Consolidation
* **Input:** Full finalized transcript, speaker attribution, timestamps.
* **Cleanup:** Deduplication, Topic segmentation, Sectioning.

### 18. Async Intelligence Pipeline (RabbitMQ)
* **Jobs:** Decision extraction, Task generation, Deadline inference, Owner assignment, Risk summarisation, Open questions.
* **LLM Usage:** Larger models allowed. Full transcript allowed. **Evidence required.**

### 19. Memory & Knowledge Writes
* **Storage:** PostgreSQL (authoritative, client-scoped).
    * Versioned decision logs (Decision)
    * Task tables (Task)
    * Open questions (OpenQuestion)
    * Important points (ImportantPoint)
    * Meeting summary (Meeting.summary field)
* **Embeddings:** pgvector (Decisions, ImportantPoints, PolicyGuardrails).
* **Scope:** All business data is client-scoped (tenant isolation).
* *This becomes client memory, queryable across the org.*

---

## PART V — ASSISTANT / CHATBOX MODE

### 20. Chatbox Invocation
* **Modes:** Voice-first or Text fallback.
* **Availability:** Usable during or outside meetings.

### 21. Intent Classification
* **Determines:** Knowledge query, Task execution, Memory write request, Reminder, Calendar/Email/GitHub action.

### 22. Knowledge Queries
* **Flow:** pgvector search (Decisions, ImportantPoints, Guardrails) + Permission filtering + Client scope.
* **LLM:** Answers via Vercel AI SDK.
* **Constraint:** Read-only unless explicitly changed. Queries respect client boundaries.

### 23. Auto-Rememberence (Explicit Only)
* **Trigger:** User says “Remember this”, “Save this”, or “Add this to memory”.
* **Flow:** Intent detected (regex) → LLM structures content (schema-bound) → Optional confirmation → System writes to DB + embeddings.
* **Constraint:** **LLM never writes directly.**

### 24. Action Execution
* **Tools:** Calendar APIs, Email APIs, GitHub APIs, Task system.
* **Guarantees:** Explicit, Logged, Reversible.

---

## SYSTEM-WIDE GUARANTEES (NON-NEGOTIABLE)

1.  **Live LLM = Read-only.**
2.  **Memory is explicit, never inferred.**
3.  **No raw STT reaches an LLM.**
4.  **Real-time paths never block.**
5.  **Every memory has evidence.**
6.  **Every decision is versioned.**

> **Final Summary:** Larity is not “an AI assistant that listens to meetings.” It is a real-time system with mechanical safeguards, where intelligence is gated, memory is earned, AI is replaceable, and failure is non-destructive.