# LARITY — COMPLETE FEATURE LIST

## I. Meeting Preparation & Execution

### Autonomous Preparation
* **Collects calendar events and participants**
* **Pulls related context:**
    * Previous meetings
    * Open decisions
    * Tasks
    * Deadlines
    * Risks
    * Relevant GitHub repos / PRs
    * Notes and documents
* **Produces a consolidated pre-meeting brief**

### Pre-Call Briefings
* Role-specific talking points
* Known risks
* Objectives per participant
* Open questions to resolve

### Live Meeting Participation
* Listens to system audio + microphone
* Streams audio in chunks to backend STT
* Real-time transcription (streaming STT)

### Live Response Suggestions
* Context-aware suggestions during meetings
* Triggered only on high-signal moments
* Non-intrusive, silent collaborator behavior

### Silent Collaborator Mode
* No interruptions
* No narration
* No continuous commentary
* **Only surfaces:**
    * Contradictions
    * Risks
    * Policy breaches
    * High-impact commitments

---

## II. Live Intelligence Pipeline (Explicit)

* STT normalization (final-only utterances)
* Utterance merging and punctuation
* Deterministic lexical trigger detection
* Lightweight intent classification (optional)
* **Gated LLM invocation:** Only triggered after Tier 1 + Tier 2 checks
* **Bounded short-term context:** 60–120s
* **Ephemeral live suggestions:**
    * Live LLM is read-only
    * No memory writes in live mode
* Fail-silent behavior on latency or errors

---

## III. Post-Meeting & Decision Logging

### Post-Call Extraction
* **Converts full transcript into:**
    * Decisions
    * Tasks
    * Owners
    * Deadlines
    * Open questions
* Extracts risks and unresolved items

### Versioned Decision Logs
* **Every decision stored with:**
    * Source transcript evidence
    * Version history
    * Timestamp
    * Author / speaker attribution
* Full auditability

---

## IV. Analysis & Risk Detection

### Sentiment & Risk Detection
* **Detects:**
    * Tone shifts
    * Dissatisfaction
    * High-risk statements
* Signals captured during meetings and post-analysis

### Policy Guardrails
* NDA enforcement
* Internal communication rules
* Legal / compliance constraints
* Approved terminology enforcement

### Impact Mapping (v1 foundations)
* **Tracks explicit dependencies:**
    * Decision → Task
    * Task → Repo
    * Repo → Timeline
* Flags potentially impacted work on new decisions

---

## V. Knowledge Management & Context

### Org-Wide Knowledge Graph
* **Entities:**
    * People
    * Meetings
    * Decisions
    * Tasks
    * Repos
    * Documents
* **Explicit relationships only** (No inferred edges in v1)
* Full provenance and traceability

### Long-Horizon Memory
* **Stores:**
    * Decisions
    * Commitments
    * Constraints
    * Summaries
    * Architectural context
* Preserves historical project evolution

### Strategic Summarisation
* **Multi-layer summaries from same data:**
    * Executive
    * Manager
    * Engineer

---

## VI. Project & Workload Management

### Timeline Prediction (Foundational)
* **Uses:**
    * Repo velocity
    * Task backlog
    * Deadlines
    * Dependencies
* Flags schedule risk

### Workload Balancing (Foundational)
* **Tracks:**
    * Task ownership
    * Bandwidth
    * Priority
* Surfaces imbalance signals

### Resource Projection (Foundational)
* Predicts upcoming capacity shortages
* Flags need for mitigation

### Org-Wide Shared Task Board
* Tasks auto-created from meetings
* Org-visible
* Synced with decisions and deadlines

---

## VII. GitHub & Development Context

### GitHub Repo Ingestion
* **Indexes:**
    * Commits
    * PRs
    * Issues
    * Discussions
* Commit-intent extraction (post-meeting / async)
* Maps code changes to tasks and decisions

---

## VIII. Communication & Calendar Integration

### Calendar Management
* Reads availability
* Creates events
* Updates events based on outcomes
* Reconciles schedules

### Email Handling
* Drafts emails
* Analyzes incoming emails
* **Extracts:**
    * Commitments
    * Sentiment
    * Follow-up actions

---

## IX. Advanced / Secondary Features

### Advanced Project Reconstruction
* **Rebuilds project briefs from:**
    * Repos
    * Notes
    * Documents
    * Historical context
* Used when context is missing

### External Stakeholder Management
* Client pulse tracking (signals only in v1)
* **Based on:**
    * Communication patterns
    * Sentiment
    * Responsiveness
    * Delivery cadence

### Document Generation
* **Drafts:**
    * Contracts
    * Proposals
    * SOWs
* Uses templates + extracted commitments

---

## X. Assistant / Chatbox Capabilities

### Interaction
* Voice-first interface
* Text fallback
* Usable during meetings and standalone

### Knowledge Q&A
* **Answers based on:**
    * Org memory
    * Knowledge graph
    * Vector search
* **No hallucinated context**

### Task Execution
* Set reminders
* Fetch / update calendar
* Email actions
* GitHub queries
* Task updates

---

## XI. Auto-Rememberance (Explicit)

* **User-commanded memory writes only**
* **Triggers:**
    * “Remember this”
    * “Save this”
* LLM structures content
* System performs authoritative write
* Optional confirmation gate
* Memory is auditable and reversible

---

## XII. System-Level Guarantees (Features by Design)

* TypeScript-first system
* Live LLM never consumes raw STT
* Live LLM never writes memory
* Memory is explicit, not inferred
* Real-time paths never block
* AI failures are non-destructive
* Every decision has evidence
* Every memory has provenance