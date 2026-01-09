# LARITY — 6-WEEK DEVELOPMENT TIMELINE

**Reference Documents:**
- [architecture-and-flow.md](./architecture-and-flow.md) — System architecture
- [meeting-mode.md](./meeting-mode.md) — Meeting mode specification
- [features.md](./features.md) — Complete feature list

---

## Current State Assessment

### Completed

| Component | Status | Details |
|-----------|--------|---------|
| **packages/infra/redis** | Done | Client, pubsub, locks, TTL, keys, health checks |
| **packages/infra/rabbitmq** | Done | Connection, exchanges (ex.events, ex.jobs), queues (q.meeting.transcribe, q.meeting.summary), publish/consume with DLQ |
| **packages/infra/prisma** | Done | Full schema with all models |
| **apps/control** | Done | Elysia API with all routes, services, validators, auth middleware |
| **apps/realtime** | Done | uWebSockets.js server with session management, audio frame ingestion, Redis publishing |

### Realtime Server Details (Already Built)

The `apps/realtime` server is fully functional:

```
Audio Flow:
Client → WebSocket (binary frames) → onMessage handler → Redis publish

Session Flow:
Connect → onOpen → addSession → publish session.start
Disconnect → onClose → removeSession → publish session.end

Redis Channels:
- realtime.audio.{sessionId} — per-session audio frames (base64 encoded)
- realtime.session.start — session start events
- realtime.session.end — session end events
```

### Not Started

- Deepgram STT integration (audio subscriber)
- Utterance finalizer
- Meeting mode state management
- Trigger system (all tiers)
- LLM integration
- Speculative processing
- Frontend UI
- Post-meeting workers
- Assistant mode

---

## Week 1: STT Pipeline & Utterance Processing

**Goal:** Connect audio frames to Deepgram and produce clean utterances.

### Day 1-2: Deepgram STT Subscriber

**packages/stt** (new package)

- [ ] Create package structure
- [ ] Implement Redis subscriber for `realtime.audio.{sessionId}` channels
- [ ] Create Deepgram client wrapper with streaming API
- [ ] Implement session-scoped Deepgram connections (one per meeting)
- [ ] Handle Deepgram events: `open`, `close`, `transcript`, `error`
- [ ] Parse partial vs final transcripts (`is_final` flag)
- [ ] Implement reconnection logic with exponential backoff
- [ ] Add connection pooling for multiple concurrent sessions

**Integration:**
- Subscribe to `realtime.session.start` → create Deepgram connection
- Subscribe to `realtime.audio.{sessionId}` → forward decoded audio to Deepgram
- Subscribe to `realtime.session.end` → close Deepgram connection

**Deliverable:** Audio frames from Redis are transcribed by Deepgram in real-time.

### Day 3-4: Utterance Finalizer

**packages/meeting-mode** (new package)

- [ ] Create package structure
- [ ] Implement `UtteranceFinalizer` class
- [ ] Buffer partial hypotheses per session
- [ ] Drop non-final segments
- [ ] Merge short utterances (< 2 seconds gap)
- [ ] Add light punctuation normalization
- [ ] Implement speaker tagging logic (YOU vs THEM based on audio source)
- [ ] Define `Utterance` type:
  ```ts
  interface Utterance {
    utteranceId: string
    sessionId: string
    speaker: 'YOU' | 'THEM'
    text: string
    timestamp: number
    confidence: number
  }
  ```
- [ ] Publish finalized utterances to Redis channel `meeting.utterance.{sessionId}`

**Deliverable:** Only clean, finalized utterances emitted downstream.

### Day 5-6: Session Lifecycle Integration

**apps/control + packages/meeting-mode**

- [ ] Add `/meeting-session/start` endpoint (creates session, returns sessionId)
- [ ] Add `/meeting-session/end` endpoint (finalizes session)
- [ ] Add `/meeting-session/:id/status` endpoint (session state)
- [ ] Implement session state in Redis (active sessions with metadata)
- [ ] Add session validation for realtime connections
- [ ] Wire control plane to listen for `realtime.session.start/end` events
- [ ] Update Meeting model status on session lifecycle

**Deliverable:** Meeting sessions are tracked authoritatively in the control plane.

### Day 7: Ring Buffer & Context Window

**packages/meeting-mode**

- [ ] Implement `RingBuffer` class for recent utterances
- [ ] Configure buffer size (60-120 seconds worth of utterances)
- [ ] Add topic-scoped retrieval (filter by topic)
- [ ] Implement bounded context assembly for LLM calls
- [ ] Add Redis persistence for buffer state (optional recovery)

**Deliverable:** Bounded, predictable context available for downstream processing.

---

## Week 2: State Management & Trigger System

**Goal:** Build the stateful meeting context that enables intelligent processing.

### Day 8-9: Topic State Management

**packages/meeting-mode**

- [ ] Define `TopicState` interface (per meeting-mode.md spec)
- [ ] Integrate embedding model (OpenAI `text-embedding-3-small` or local)
- [ ] Implement topic centroid calculation and comparison
- [ ] Build topic assignment logic (similarity threshold)
- [ ] Implement rolling topic summary (compressed, not raw)
- [ ] Add topic state persistence in Redis (per session)
- [ ] Publish topic change events to Redis

**Deliverable:** Utterances are assigned to semantic topics that persist across the meeting.

### Day 10-11: Constraint & Commitment Ledgers

**packages/meeting-mode**

- [ ] Define `Constraint` interface (type, value, source, confidence)
- [ ] Define `Commitment` interface (statement, speaker, status)
- [ ] Implement constraint extraction from preloaded data (decisions, policies)
- [ ] Build constraint detection from utterances:
  - [ ] Date/deadline parser
  - [ ] Capacity keywords
  - [ ] Dependency phrases
  - [ ] Policy terms
- [ ] Implement commitment tracking with provisional status
- [ ] Add delta comparison logic (new vs existing constraints)
- [ ] Persist ledgers in Redis per session

**Deliverable:** Explicit constraint and commitment tracking throughout meeting.

### Day 12-13: Trigger System (Tiers 1-3)

**packages/meeting-mode**

- [ ] **Tier 1: Deterministic Fast Path (<50ms)**
  - [ ] Policy keyword regex patterns
  - [ ] Date/deadline parser with extraction
  - [ ] Forbidden terms keyword set (NDA, etc.)
  - [ ] Scope change pattern matcher
  - [ ] Emit instant alerts for matches
- [ ] **Tier 2: Intent Classification (<100ms)**
  - [ ] Integrate small classifier (local model or lightweight API)
  - [ ] Labels: `commitment`, `decision`, `question`, `concern`, `risk`, `filler`
  - [ ] Confidence threshold filtering (drop low confidence)
- [ ] **Tier 3: Topic Novelty Check (<50ms)**
  - [ ] Debounce logic per topic (same thing said twice)
  - [ ] Material difference detection (semantic comparison)
  - [ ] Repetition suppression

**Deliverable:** ~90% of utterances filtered out, only high-signal ones proceed to LLM.

### Day 14: Speaker-Aware Processing

**packages/meeting-mode**

- [ ] Implement speaker detection from audio source tag
- [ ] Build priority queue for processing
- [ ] Add parallel tier processing for YOUR speech
- [ ] Implement adaptive confidence thresholds by speaker:
  - [ ] YOU: 0.7 threshold, parallel processing
  - [ ] THEM: 0.85 threshold, sequential processing
- [ ] Add priority queue position for LLM calls

**Deliverable:** Responsiveness prioritized when user is speaking.

---

## Week 3: LLM Integration & Optimizations

**Goal:** Enable real-time risk detection and suggestions with optimized latency.

### Day 15-16: LLM Integration (Tier 4)

**packages/meeting-mode**

- [ ] Set up Vercel AI SDK integration
- [ ] Define LLM request/response schemas (Zod):
  ```ts
  interface LLMResponse {
    type: 'warning' | 'suggestion' | 'clarification' | 'none'
    severity: 'low' | 'medium' | 'high'
    message: string
    suggestion?: string
    confidence: number
    shouldSurface: boolean
  }
  ```
- [ ] Implement narrow prompt templates:
  - [ ] Risk evaluation: "Does this statement create risk given these constraints?"
  - [ ] Contradiction detection: "Does this contradict any known constraints?"
  - [ ] Clarification suggestion: "What clarifying question would help?"
- [ ] Add streaming response handling
- [ ] Implement timeout (400ms max) and fallback logic (fail-silent)
- [ ] Add response validation and schema enforcement

**Deliverable:** LLM can be invoked for specific, narrow validation tasks.

### Day 17-18: Speculative Processing

**packages/meeting-mode**

- [ ] Implement speculative processing on partial utterances (confidence > 0.7)
- [ ] Build speculative cache structure:
  ```ts
  interface SpeculativeResult {
    partialText: string
    predictedTopic: string
    preloadedConstraints: Constraint[]
    intentClassification?: string
    llmPrewarm: boolean
  }
  ```
- [ ] Add speculation validation on final utterance (text similarity check)
- [ ] Implement speculative discard logic (mismatch > 30%)
- [ ] Add LLM connection pre-warming for high-signal keywords
- [ ] Measure and log speculation hit rate

**Deliverable:** 200-300ms latency reduction through speculation.

### Day 19-20: Predictive Constraint Loading

**apps/control + packages/meeting-mode**

- [ ] Add agenda parsing from calendar event (if available)
- [ ] Implement topic prediction from meeting title/agenda
- [ ] Build constraint pre-embedding for predicted topics
- [ ] Create hot cache for topic → constraint mappings
- [ ] Add cache warming on session start (before audio arrives)
- [ ] Implement cache refresh on topic shift

**Deliverable:** Relevant constraints are pre-loaded before topics are discussed.

### Day 21: Alert Generation & Publishing

**packages/meeting-mode**

- [ ] Define alert types and severity levels
- [ ] Implement alert generation from trigger results
- [ ] Add alert deduplication (don't repeat same alert)
- [ ] Build alert queue with expiry (10-15 seconds relevance window)
- [ ] Publish alerts to Redis channel `meeting.alert.{sessionId}`
- [ ] Add alert logging for post-meeting analysis

**Deliverable:** Alerts are generated, deduplicated, and published for UI consumption.

---

## Week 4: Frontend & End-to-End Integration

**Goal:** Build the meeting mode UI and complete the end-to-end flow.

### Day 22-23: Desktop App Foundation

**apps/desktop**

- [ ] Set up React Router with app shell
- [ ] Create navigation structure (Dashboard, Meeting Mode, Settings)
- [ ] Build WebSocket connection manager (to realtime server)
- [ ] Implement session state in React context
- [ ] Create audio capture hook using Tauri APIs
- [ ] Build audio streaming to WebSocket (binary frames)
- [ ] Add connection status indicator

**Deliverable:** Desktop app can capture audio and stream to realtime server.

### Day 24-25: Ambient UI Components

**apps/desktop**

- [ ] **Topic Indicator Component**
  - [ ] Subscribe to topic change events
  - [ ] Display current topic label
  - [ ] Smooth transition animation on topic shift
  - [ ] Empty state for no topic yet
- [ ] **Constraint Counter Component**
  - [ ] Display count of tracked constraints
  - [ ] Pulse animation on increment
  - [ ] Tooltip with constraint summary
- [ ] **Listening Heartbeat Component**
  - [ ] Visual audio processing indicator (waveform or pulse)
  - [ ] Disappears on stream drop (error signal)
  - [ ] Reconnection indicator

**Deliverable:** Ambient awareness layer proving system is alive.

### Day 26-27: Alert System UI

**apps/desktop**

- [ ] Subscribe to `meeting.alert.{sessionId}` Redis channel (via WebSocket)
- [ ] Build alert queue in React state (max 2 visible)
- [ ] Implement auto-expire (fade after 10-15 seconds)
- [ ] Create dismissible alert component
- [ ] Add alert animations (slide in from right, fade out)
- [ ] Style alerts by severity (info, warning, critical)
- [ ] Add "Checking..." indicator for pending LLM calls

**Deliverable:** Non-intrusive, contextual alerts surface to user.

### Day 28: Meeting Mode Screen

**apps/desktop**

- [ ] Build meeting mode main screen layout
- [ ] Integrate all ambient UI components
- [ ] Add meeting controls:
  - [ ] Start Meeting Mode button
  - [ ] End Meeting button
  - [ ] Pause/Resume (optional)
- [ ] Display session state (connected, duration, utterance count)
- [ ] Add basic live transcript viewer (scrolling list)
- [ ] Show constraint/commitment counts

**Deliverable:** Complete meeting mode UI.

### Day 29-30: End-to-End Integration & Testing

**All apps**

- [ ] Integration test: full pipeline
  ```
  Audio capture → WebSocket → Redis → Deepgram → Utterance →
  Triggers → LLM → Alert → UI
  ```
- [ ] Performance testing against latency budgets:
  - [ ] Audio → Utterance: < 100ms
  - [ ] Tier 1 checks: < 50ms
  - [ ] LLM streaming start: < 400ms
  - [ ] End-to-end: < 800ms
- [ ] Add structured logging throughout pipeline
- [ ] Implement basic observability (timing metrics)
- [ ] Fix bugs and edge cases
- [ ] Create demo workflow documentation

**Deliverable:** Working meeting mode end-to-end.

---

## Week 5: Post-Meeting Pipeline

**Goal:** Process completed meetings, extract insights, and write to persistent memory.

### Day 31-32: Worker Infrastructure

**apps/workers**

- [ ] Set up worker app structure
- [ ] Implement RabbitMQ consumer base class
- [ ] Create worker lifecycle management (graceful shutdown)
- [ ] Add health check endpoints
- [ ] Implement job retry logic with exponential backoff
- [ ] Set up worker logging and metrics

**Deliverable:** Worker infrastructure ready to consume jobs.

### Day 33-34: Transcript Processing Worker

**apps/workers**

- [ ] Implement `q.meeting.transcribe` consumer
- [ ] Integrate Whisper API for batch STT refinement
- [ ] Compare Whisper output with Deepgram live transcript
- [ ] Merge/reconcile transcripts (prefer Whisper accuracy)
- [ ] Store refined transcript to database
- [ ] Publish `transcript.ready` event

**Deliverable:** High-quality refined transcripts from Whisper.

### Day 35: Speaker Diarization

**apps/workers**

- [ ] Integrate speaker diarization service (pyannote or API)
- [ ] Map diarized segments to transcript
- [ ] Update transcript with speaker labels
- [ ] Handle multi-speaker scenarios
- [ ] Store diarized transcript

**Deliverable:** Transcripts have accurate speaker attribution.

### Day 36-37: Decision & Task Extraction

**apps/workers**

- [ ] Implement extraction worker for `q.meeting.summary`
- [ ] Create LLM prompts for:
  - [ ] Decision extraction (with evidence)
  - [ ] Task extraction (with assignee, deadline inference)
  - [ ] Open question extraction
  - [ ] Important point extraction
- [ ] Define extraction schemas (Zod)
- [ ] Validate LLM outputs against schemas
- [ ] Handle extraction failures gracefully

**Deliverable:** Structured data extracted from transcripts.

### Day 38-39: Memory Writes

**apps/workers**

- [ ] Write extracted decisions to PostgreSQL (versioned)
- [ ] Write tasks with inferred owners/deadlines
- [ ] Write open questions
- [ ] Write important points with categories
- [ ] Update meeting summary field
- [ ] Generate embeddings for vector search (pgvector)
- [ ] Publish `meeting.processed` event

**Deliverable:** Meeting insights persisted to database, searchable.

### Day 40: Post-Meeting Integration

**apps/control + apps/workers**

- [ ] Add `/meetings/:id/insights` endpoint (decisions, tasks, questions)
- [ ] Add `/meetings/:id/transcript` endpoint (refined transcript)
- [ ] Wire session end to trigger post-meeting jobs
- [ ] Add job status tracking in Redis
- [ ] Implement webhook for processing complete notification

**Deliverable:** Post-meeting data accessible via API.

---

## Week 6: Assistant Mode

**Goal:** Build the conversational assistant with knowledge access and action execution.

### Day 41-42: Vector Search Setup

**packages/infra + apps/control**

- [ ] Add pgvector extension to PostgreSQL
- [ ] Create embedding columns on relevant tables:
  - [ ] decisions.embedding
  - [ ] important_points.embedding
  - [ ] policy_guardrails.embedding
- [ ] Implement embedding generation on insert/update
- [ ] Create vector similarity search functions
- [ ] Add search endpoint `/search` with filters (client, date range, type)

**Deliverable:** Semantic search across organizational memory.

### Day 43-44: Assistant Core

**packages/assistant** (new package)

- [ ] Create package structure
- [ ] Implement intent classifier for user queries:
  - [ ] `knowledge_query` — search and answer
  - [ ] `action_request` — execute something
  - [ ] `memory_write` — remember something
  - [ ] `clarification` — need more info
- [ ] Build context assembly for assistant LLM calls
- [ ] Implement RAG pipeline:
  - [ ] Query → embedding → vector search → context → LLM → response
- [ ] Add conversation history management
- [ ] Define assistant response schemas

**Deliverable:** Assistant can answer questions using organizational memory.

### Day 45-46: Action Execution

**packages/assistant + apps/control**

- [ ] Define action types:
  ```ts
  type ActionType =
    | 'create_task'
    | 'create_reminder'
    | 'update_task'
    | 'search_memory'
    | 'calendar_query'
    | 'email_draft'
  ```
- [ ] Implement action handlers:
  - [ ] Task creation/update via existing services
  - [ ] Reminder creation
  - [ ] Memory search with natural language
- [ ] Add confirmation flow for destructive actions
- [ ] Implement action logging for audit
- [ ] Add undo capability for recent actions

**Deliverable:** Assistant can execute actions on user's behalf.

### Day 47-48: Auto-Rememberance

**packages/assistant**

- [ ] Implement trigger detection for memory writes:
  - [ ] "Remember this"
  - [ ] "Save this"
  - [ ] "Add this to memory"
- [ ] Build memory structuring with LLM:
  - [ ] Extract what to remember
  - [ ] Categorize (constraint, commitment, insight, etc.)
  - [ ] Generate embedding
- [ ] Add optional confirmation gate
- [ ] Write to appropriate table with evidence
- [ ] Publish memory write event

**Deliverable:** Explicit user-commanded memory writes.

### Day 49-50: Assistant UI

**apps/desktop**

- [ ] Build chatbox component
- [ ] Implement text input with send
- [ ] Add voice input using Tauri audio APIs (push-to-talk)
- [ ] Display assistant responses with markdown
- [ ] Show action confirmations inline
- [ ] Add typing indicator for LLM processing
- [ ] Implement conversation history scroll
- [ ] Add quick action buttons (common queries)

**Deliverable:** Functional assistant interface in desktop app.

### Day 51-52: Assistant Integration & Polish

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
| 1 | 1-7 | STT Pipeline | Deepgram integration, utterance finalizer, session lifecycle |
| 2 | 8-14 | State & Triggers | Topic state, ledgers, trigger tiers 1-3, speaker-aware |
| 3 | 15-21 | LLM & Optimization | Tier 4 LLM, speculative processing, alerts |
| 4 | 22-30 | Frontend | Desktop UI, ambient components, end-to-end testing |
| 5 | 31-40 | Post-Meeting | Workers, Whisper, diarization, extraction, memory writes |
| 6 | 41-52 | Assistant | Vector search, RAG, actions, auto-rememberance, UI |

**Total: 52 working days (~10.5 weeks with weekends, or 7.5 weeks at 7 days/week)**

---

## Package Structure

```
packages/
├── infra/                    # DONE
│   ├── redis/                # Client, pubsub, locks, TTL, keys
│   ├── rabbitmq/             # Connection, exchanges, queues, publish/consume
│   └── prisma/               # Schema, generated client
├── stt/                      # Week 1
│   ├── deepgram/
│   │   ├── client.ts         # Deepgram streaming client
│   │   ├── connection.ts     # Session-scoped connections
│   │   └── types.ts
│   ├── whisper/              # Week 5
│   │   ├── client.ts         # Whisper batch API
│   │   └── types.ts
│   ├── subscriber.ts         # Redis audio subscriber
│   └── index.ts
├── meeting-mode/             # Week 1-3
│   ├── utterance/
│   │   ├── finalizer.ts
│   │   ├── ring-buffer.ts
│   │   └── types.ts
│   ├── state/
│   │   ├── topic-state.ts
│   │   ├── constraint-ledger.ts
│   │   ├── commitment-ledger.ts
│   │   └── session-state.ts
│   ├── triggers/
│   │   ├── tier1-deterministic.ts
│   │   ├── tier2-classifier.ts
│   │   ├── tier3-novelty.ts
│   │   ├── tier4-llm.ts
│   │   └── pipeline.ts
│   ├── llm/
│   │   ├── client.ts
│   │   ├── prompts.ts
│   │   └── schemas.ts
│   ├── speculative/
│   │   ├── processor.ts
│   │   └── cache.ts
│   ├── alerts/
│   │   ├── generator.ts
│   │   └── publisher.ts
│   └── index.ts
├── extraction/               # Week 5
│   ├── decisions.ts
│   ├── tasks.ts
│   ├── questions.ts
│   ├── points.ts
│   ├── prompts.ts
│   ├── schemas.ts
│   └── index.ts
└── assistant/                # Week 6
    ├── intent/
    │   ├── classifier.ts
    │   └── types.ts
    ├── rag/
    │   ├── search.ts
    │   ├── context.ts
    │   └── response.ts
    ├── actions/
    │   ├── executor.ts
    │   ├── handlers.ts
    │   └── types.ts
    ├── memory/
    │   ├── rememberance.ts
    │   └── writer.ts
    └── index.ts
```

---

## Apps Status

```
apps/
├── control/                  # DONE - Elysia API
│   └── (routes, services, validators, middleware)
├── realtime/                 # DONE - uWebSockets.js
│   └── (WebSocket server, session management, Redis publishing)
├── desktop/                  # Week 4 + Week 6 - Tauri + React
│   └── (meeting mode UI, assistant UI)
└── workers/                  # Week 5 - RabbitMQ consumers
    ├── transcribe.worker.ts
    ├── diarize.worker.ts
    ├── extract.worker.ts
    └── index.ts
```

---

## Daily Standup Template

```markdown
## Day X - [Date]

### Completed
- [ ] Task 1
- [ ] Task 2

### In Progress
- [ ] Task 3 (blocker: ...)

### Tomorrow
- [ ] Task 4
- [ ] Task 5

### Notes
- Any discoveries, decisions, or blockers
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Deepgram latency spikes | Implement timeout + skip, don't block pipeline |
| LLM response too slow | Streaming responses, 400ms timeout, fail-silent |
| Audio capture issues on Windows | Test early with Tauri, have fallback mechanisms |
| Speculative processing low hit rate | Monitor hit rate, adjust confidence threshold dynamically |
| Topic clustering inaccurate | Start with simple embedding, tune threshold iteratively |
| Redis pubsub message loss | Accept loss for audio frames (not critical), log for debugging |
| Whisper API latency | Async processing, user doesn't wait for it |
| Vector search slow | Add indexes, limit result count, cache frequent queries |
| Speaker diarization accuracy | Use as hint, allow manual correction post-meeting |

---

## Success Metrics

### End of Week 4 (Meeting Mode Complete)

| Metric | Target |
|--------|--------|
| Audio → Utterance latency | < 100ms |
| Tier 1 check latency | < 50ms |
| Tier 2 classification latency | < 100ms |
| LLM response (streaming start) | < 400ms |
| Utterance drop rate (Tier 1-3) | ~90% |
| Speculative processing hit rate | > 80% |
| Alert render latency | < 32ms |
| End-to-end (utterance → alert) | < 800ms |

### End of Week 5 (Post-Meeting Complete)

| Metric | Target |
|--------|--------|
| Transcript processing time | < 5 min per hour of meeting |
| Decision extraction accuracy | > 85% |
| Task extraction accuracy | > 80% |
| Memory write success rate | > 99% |

### End of Week 6 (Assistant Complete)

| Metric | Target |
|--------|--------|
| Vector search latency | < 200ms |
| Assistant response time | < 2s |
| Action execution success rate | > 95% |
| Query relevance (user satisfaction) | > 80% |

---

## Dependencies

### External Services
- **Deepgram** — Streaming STT (API key required)
- **OpenAI Whisper API** — Batch STT refinement
- **OpenAI / OpenRouter** — LLM for Tier 4, extraction, assistant
- **OpenAI** — Embeddings for topic clustering and vector search
- **Speaker Diarization** — pyannote.audio or third-party API

### Infrastructure
- **Redis** — Already configured in packages/infra
- **PostgreSQL + pgvector** — Already configured with Prisma (add pgvector extension)
- **RabbitMQ** — Already configured for worker queues

---

## Notes

- This timeline assumes 1 developer working full-time
- 52 working days = ~7.5 weeks at 7 days/week, or ~10.5 weeks with weekends
- Realtime server and infrastructure are already complete — significant head start
- Week 1 focuses on connecting Deepgram to existing audio pipeline
- Week 5-6 can be parallelized if additional developer available
- Adjust based on actual velocity after Week 1
- No Chrome extension — desktop-first approach
