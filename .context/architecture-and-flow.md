# LARITY — FULL USER FLOW & ARCHITECTURE

*Chronological order of system behavior.*

## 0. High-Level Mental Model
Larity operates in three hard-separated modes. **No data, logic, or permissions leak across these modes.**

1.  **Live Meeting Mode** → Fast, read-only, ephemeral.
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

### 5. Meeting Join
* **User Action:** User joins meeting and clicks “Enable Live Mode”.
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

### 9. Intent Gate (Critical Control Point)
* **Deterministic Checks:**
    * Commitment language.
    * Decision phrasing.
    * Questions / Risk keywords.
    * Policy terms.
    * Speaker relevance.
* **Outcome:** ~90% utterances dropped. Only triggered utterances proceed.
* **Protects:** Cost, Latency, Stability, Correctness.

### 10. Short-Term Context Assembly
* **Context Source:** Ring buffer (last 60–120 seconds).
* **Filter:** Same topic, relevant speakers only.
* **Payload:** Tiny, bounded, predictable.
* **Constraint:** **No long-term memory. No vector search.**

### 11. Live LLM Invocation (Read-Only)
* **LLM Characteristics:** Small, fast model (OpenRouter) with fixed prompt.
* **Structure:** Zod-enforced output schema (Vercel AI SDK).
* **Task:** Evaluate risk, Flag contradiction, Suggest safer phrasing, Detect policy breach.
* **Output:** Ephemeral hint. Optional UI surfacing. **No persistence.**
* *Note: If slow or wrong → silently skipped.*

### 12. Silent Collaborator Behavior
* No interruption. No narration. No spam.
* **Surfaces only high-signal events.**
* *This is by mechanical design, not tuning.*

---

## PART IV — POST-MEETING MODE (AUTHORITATIVE)

### 13. Meeting Ends
* **State Transition:** Live mode off. **Memory writes enabled.** Async processing begins.

### 14. Transcript Consolidation
* **Input:** Full finalized transcript, speaker attribution, timestamps.
* **Cleanup:** Deduplication, Topic segmentation, Sectioning.

### 15. Async Intelligence Pipeline (RabbitMQ)
* **Jobs:** Decision extraction, Task generation, Deadline inference, Owner assignment, Risk summarisation, Open questions.
* **LLM Usage:** Larger models allowed. Full transcript allowed. **Evidence required.**

### 16. Memory & Knowledge Writes
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

### 17. Chatbox Invocation
* **Modes:** Voice-first or Text fallback.
* **Availability:** Usable during or outside meetings.

### 18. Intent Classification
* **Determines:** Knowledge query, Task execution, Memory write request, Reminder, Calendar/Email/GitHub action.

### 19. Knowledge Queries
* **Flow:** pgvector search (Decisions, ImportantPoints, Guardrails) + Permission filtering + Client scope.
* **LLM:** Answers via Vercel AI SDK.
* **Constraint:** Read-only unless explicitly changed. Queries respect client boundaries.

### 20. Auto-Rememberence (Explicit Only)
* **Trigger:** User says “Remember this”, “Save this”, or “Add this to memory”.
* **Flow:** Intent detected (regex) → LLM structures content (schema-bound) → Optional confirmation → System writes to DB + embeddings.
* **Constraint:** **LLM never writes directly.**

### 21. Action Execution
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