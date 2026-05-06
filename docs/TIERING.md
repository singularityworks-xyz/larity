# TIERING — The Larity Pipeline

Larity's meeting-mode pipeline is a four-tier classification cascade that processes every utterance spoken in a meeting. What makes it unusual is not the tiers themselves — plenty of systems chain models — but how aggressively we push work off the critical path, how we contain LLM spend without sacrificing coverage, and how the pipeline self-governs per-speaker, per-category, and per-session.

---

## The Pipeline at a Glance

```
Utterance arrives
  │
  ├─ Pre-Filter   (<10ms, zero network)
  │  Drops: acknowledgments, sub-3-word fragments, near-duplicates
  │
  ├─ Speculative Cache Lookup   (<1ms)
  │  If we already ran Tier 2 on a near-identical partial: use it.
  │
  ├─ Tier 1 — Structural Detection   (<50ms, zero network)
  │  Regex + fuzzy match: dates, numbers, API keys, blocklist keywords, client names
  │
  ├─ Tier 2 — Small LLM Classification   (~200ms, Gemini flash-lite)
  │  Intent, tone, risk signals, commitment type, extracted data
  │
  ├─ Tier 3 — Embedding Search   (~100ms, pgvector)
  │  Novelty check, commitment ledger similarity, organizational memory
  │
  └─ Tier 4 — Deep Reasoning   (~1s, conditional)
     Only invoked when earlier tiers warrant it. Speaker-aware, cost-gated.
```

**The critical design principle:** every tier before Tier 4 acts as a **gate that can suppress Tier 4**, not as a funnel that loses information. Everything passes through Tiers 1-3. Tier 4 is the expensive exception, not the rule.

---

## Cool Features

### 1. Speculative Processing — Running the LLM Before the Speaker Finishes

This is the single biggest latency win in the system. Partial (in-flight, not-yet-final) utterances from speech-to-text arrive with a confidence score. When a partial hits confidence > 0.7, we don't wait for the speaker to finish — we fire the Tier 2 LLM in the background *while they're still forming the sentence*.

By the time the final utterance lands, the Tier 2 result (intent, tone, risk signals, extracted data) is already cached. A **Levenshtein distance** check validates that the partial text and final text are close enough (mismatch < 30%). If the speaker changed their sentence at the last moment, the cache is discarded and Tier 2 runs normally. No hallucination risk. Just 200-300ms saved on the critical path.

**Why this is unusual:** speculation is normally dangerous — you can't trust partial results. We made it safe by treating the cached classification as a **candidate**, not a truth, and validating with a structure-agnostic text distance metric before accepting it.

### 2. Speaker-Aware Everything

The pipeline doesn't treat all speakers equally. Every utterance carries a `SpeakerIdentity` that tracks whether the speaker is:
- The **current user** (the person running Larity on their machine) — priority `high`
- A **team member** (colleague) — priority `standard`
- An **external party** (client, vendor, unidentified) — priority `low`

This priority cascades into multiple decisions:

| Decision | Current User | Team Member | External |
|----------|-------------|-------------|----------|
| Speculative processing | Yes | Yes | **No** |
| Tier 4 alert threshold | **0.70** | **0.80** | **0.85** |
| Alert routing | Personal | Team-wide (or personal if own) | Team-wide |

The reasoning: we don't want to waste tokens speculatively analyzing a client mid-sentence — their risk is not our risk. And we don't want the AI buzzing the user's screen every time a client says something marginally risky at 0.70 confidence. But when the *user* is making a mistake, we surface alerts faster (lower threshold) and show them privately (personal routing).

### 3. Per-Category Confidence Thresholds (Silent Collaborator)

A single global "alert if confidence > X" threshold doesn't work in practice. A `tone_warning` at 0.50 confidence is noise. A `policy_violation` at 0.60 confidence is actionable. So every alert category has its own floor:

```
policy_violation        0.60   ← surfacing earlier: compliance matters
information_risk        0.60
self_contradiction      0.65
team_inconsistency      0.70
client_backtrack        0.70
pressure_detected       0.75
risky_commitment        0.75
scope_creep             0.75
client_disengagement    0.80
missing_clarity         0.80
tone_warning            0.85   ← surfacing later: avoid noise
undiscussed_agenda      0.85
```

The Tier 4 LLM is prompted to self-calibrate (0.9+ = clear, 0.75-0.89 = likely, <0.75 = usually suppress), but the per-category thresholds in code act as a **second safety layer** — even if the LLM is too confident, we enforce a minimum.

### 4. Cost-Gated Deep Reasoning

Tier 4 (the deep LLM call) is the most expensive operation in the pipeline. We suppress it aggressively through three independent gates:

- **Tier 2 `shouldStopForDeepReasoning`:** If the utterance is filler or general chat with no risk signals and >0.8 confidence, Tier 4 never fires. This alone blocks ~60% of utterances from reaching Tier 4.
- **Session cost cap:** When a meeting reaches **$2.00** in cumulative LLM spend, Tier 4 is **completely disabled** for the remainder of the session. No exceptions.
- **Warning mode:** At **$1.60 (80%)**, Tier 4 only fires for high-signal utterances (blocklist hits, technical hits, risk signals). Otherwise suppressed.

The cost cap applies per-session, tracked via Redis (`INCRBYFLOAT` for atomic increments), with in-memory fallback if Redis is down. This means a 90-minute meeting with constant speech won't silently run up a $20 bill — it'll gracefully dial back to the cheaper tiers and still provide structural detection (which is free).

### 5. Speculative LLM Cost Tracking

A subtle but important edge: the background Tier 2 calls on partial utterances aren't free. If we don't record those tokens, the cost cap doesn't see them, and we can blow past our limit. Every speculative `tier2.classify()` call records its prompt and completion tokens against the same `CostManager` tracking the main pipeline. The cost cap has full visibility into total spend, speculative and non-speculative alike.

---

## Complications We Hit and Solved

### Partial Utterances Arrived Before Session Hydration

**Problem:** Speculative processing on partials fired before `ensureSessionHydrated()` had run. This meant `Tier1StructuralDetector.detect()` had no session-specific blocklist terms or client names — it used empty defaults. The speculative processor missed blocklist hits it should have caught, and the predictive preloader had no constraints to prefetch (silently returned `[]`).

**Fix:** Made `evaluatePartial()` async and inserted `await this.ensureSessionHydrated(partial.sessionId)` before any speculative processing. The first partial now hydrates the session before any work begins.

### Speculative Cache Hit Skipped Side Effects

**Problem:** When a speculative cache hit occurred, the code short-circuited past `runTier2()` entirely. This meant three side effects ran on every *normal* utterance but were lost on speculative hits: commitment persistence (`maybeWriteCommitment`), topic delta application, and Tier 2 semantic cache priming. Commitments would silently fail to save.

**Fix:** Extracted an `applyTier2SideEffects()` helper that runs regardless of whether the classification came from a live LLM call or a speculative cache hit. The helper is called from both paths.

### Speculative Cache Dedup Used Reference Equality

**Problem:** `r.classification === result.classification` — JavaScript strict-equality on objects. Since every LLM call creates a new `Tier2Classification` object, this expression was always `false`. The deduplication block was dead code; the cache could fill with semantically identical entries.

**Fix:** Replaced with a `JSON.stringify`-based structural comparison (`structuredEquiv` helper). Semantically equal classifications are now properly identified and deduplicated.

### Agenda Constraint ID Collisions

**Problem:** IDs were generated as `agenda-${Buffer.from(item).toString("base64").slice(0, 12)}`. Two agenda items starting with the same 9 characters (e.g. "Review pricing proposal" vs "Review pricing changes") produced identical base64 prefixes and thus identical IDs. Since `mergeConstraints` deduplicates on `c.id`, distinct items were silently dropped.

**Fix:** Replaced with `crypto.createHash("sha256").update(item).digest("hex")` — full 64-character hash, no possible collision.

### Dead `topicToConstraints` Memory Leak

**Problem:** The `PredictivePreloader` maintained a `topicToConstraints` map that was written to during `seedFromContext()` and cleaned up in `closeSession()`/`closeAll()`, but **never read** anywhere. `prefetch()` and `getHotConstraints()` use `hotCache` exclusively. The map grew unbounded over sessions with no functional benefit.

**Fix:** Removed the field, its writer (`getOrCreateTopicMap`), and all associated cleanup code.

---

## Out of the Box Thinking

### 1. Tier 1 Is an Accelerator, Not a Gate

Most tiered systems use early tiers to *drop* utterances — if something looks safe, stop. Larity does the opposite. Every utterance passes through all tiers unconditionally. Tier 1 catches structural patterns (API keys, dates, blocklist terms) and can fire instant alerts, but it never prevents Tier 2 or Tier 3 from running.

The math: Tier 1 is essentially free (<50ms, zero network). Tier 2 is cheap (~$0.0005/utterance). Tier 4 is expensive (~$0.005-0.01/utterance). The gates are at Tier 4, not before it. We'd rather spend $0.0005 confirming something is safe than risk missing a policy violation.

### 2. Single Semantic Source of Truth

Tier 2 is the **only** component that extracts semantic meaning from utterances. Topic state changes, commitment detection, tone analysis — all flow from `Tier2Classification.topicDelta` and friends. We don't call a separate LLM for topic summarization, a separate one for tone, a separate one for commitment extraction. One call, one structured output, consumed by every downstream system.

This matters for cost: replacing "three small LLM calls per utterance" with "one call" is the difference between $0.015 and $0.0005 per utterance. Over a 60-minute meeting with 300 utterances, that's $4.50 vs $0.15.

### 3. Embedding Stripping for Tier 4 Prompts

When assembling the Tier 4 prompt context, we include recent utterances and commitments — but we explicitly strip their embedding vectors first. Embeddings are large (typically 768-1536 floats) and useless to the LLM (it can't consume them). Stripping them reduces prompt token count significantly, which directly reduces Tier 4 cost.

### 4. Preloaded Context for No-DB-on-Hot-Path

Tier 3 memory searches hit pgvector, but only for IDs and similarity scores. The actual content (decisions, policy guardrails, important points) is hydrated once during session startup into a preloaded context payload. Tier 4 references this payload rather than querying the database per utterance. This eliminates 3-6 database round-trips from the per-utterance critical path.

### 5. Levenshtein Over Semantic Similarity for Cache Validation

When validating whether a cached speculative result matches the final utterance, we use raw Levenshtein distance — not embedding similarity. This is deliberate: embeddings can be close (0.95 cosine similarity) for utterances that mean entirely different things (e.g. "we can offer a 20% discount" vs "we can offer nothing"). Levenshtein catches when the speaker *literally changed their words* at the last moment, which is the actual failure mode for speculation.

### 6. Shared Embedding Reuse

One embedding is generated per utterance and reused across:
- Tier 3 novelty/memory/ledger search
- Tier 2 semantic cache keying
- Topic centroid assignment
- Commitment ledger inserts

We never re-embed the same utterance text. This cuts embedding API costs by 3-4× compared to a design where each tier generates its own embedding.

---

## Cost Savings: Where the Money Goes

Running a real-time meeting AI pipeline isn't free. Here's how the design keeps costs manageable:

| Mechanism | What It Saves | Estimated Impact |
|-----------|--------------|------------------|
| **Speculative Tier 2** | Avoids ~70% of Tier 2 calls from being on the critical path | Latency, not cost (the call still happens) |
| **Tier 2 Semantic Cache** | Same utterance, re-spoken? Skip the LLM call entirely | 5-15% of Tier 2 calls eliminated |
| **Tier 2 `shouldStopForDeepReasoning`** | Blocks filler/general chat from reaching Tier 4 | ~60% of utterances never invoke Tier 4 |
| **Session cost cap ($2.00)** | Hard stop on cumulative LLM spend | Guarantees per-meeting ceiling |
| **Warning mode ($1.60)** | Only high-risk utterances reach Tier 4 at 80%+ cost | Gradual degradation, not hard cliff |
| **Single semantic source (Tier 2)** | No duplicate LLM calls for tone/topic/extraction | 3× fewer LLM calls per utterance |
| **Shared embedding reuse** | No duplicate embedding API calls | 3-4× fewer embedding calls |
| **Embedding stripping for Tier 4** | Smaller prompts → fewer input tokens | ~15-25% reduction in Tier 4 input tokens |
| **Preloaded context** | No per-utterance DB queries for memory content | Eliminates 3-6 round-trips from critical path |

**The net result for a typical 60-minute meeting (~300 utterances):**
- Tier 2 calls: ~300 × $0.0005 = $0.15
- Tier 4 calls: ~120 (40% of utterances) × $0.005 = $0.60
- Total: **~$0.75-1.00 per meeting**

Without these optimizations, the same meeting would cost roughly $3-5.

---

## Architecture Diagram

```
                         ┌──────────────────────────┐
                         │   Partial Utterance arrives  │
                         │   (confidence > 0.7? ──► Speculative Tier 2)  │
                         └──────────────────────────┘
                                     │
                         ┌──────────────────────────┐
                         │   Final Utterance arrives    │
                         └──────────┬───────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │    Pre-Filter      │  <10ms, free
                          │  (drop filler/noise)│
                          └─────────┬─────────┘
                                    │
                          ┌─────────▼─────────┐
                          │ Speculative Cache  │  <1ms
                          │    (Levenshtein)   │
                          └────┬──────────┬────┘
                           hit │          │ miss
                    ┌──────────▼──┐       │
                    │ Use cached   │       │
                    │ Tier2 result │       │
                    └──────┬───────┘       │
                           │               │
                    ┌──────▼───────────────▼──┐
                    │  Tier 1    │   Tier 2    │ ← Parallel
                    │ (regex)   │ (Gemini flash)│
                    └───────────┴──────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │      Tier 3         │  pgvector search
                          │ (novelty + ledger +  │
                          │  memory, in parallel)│
                          └─────────┬──────────┘
                                    │
                          ┌─────────▼──────────┐
                          │    Gate Decision     │
                          │  • Tier2 stop?       │
                          │  • Speaker priority? │
                          │  • Cost cap/warning? │
                          │  • Category threshold│
                          └────┬──────────┬──────┘
                               │          │
                          stop │          │ invoke
                               │   ┌──────▼──────┐
                               │   │   Tier 4     │
                               │   │ (Gemini flash)│ ~1s, conditional
                               │   └──────┬──────┘
                               │          │
                               └──────────▼──────────
                                          │
                                      Alert Published
                               (shared / personal / both)
```

---

## Key Constants Reference

| Constant | Value | Where Used |
|----------|-------|------------|
| `SPECULATIVE_CONFIDENCE_THRESHOLD` | 0.7 | Minimum partial confidence to trigger speculation |
| `SPECULATIVE_MISMATCH_THRESHOLD` | 0.3 | Max Levenshtein mismatch for cache hit |
| `SPECULATIVE_TTL_MS` | 10,000 | Speculative cache entry expiry |
| `SPECULATIVE_MAX_ENTRIES_PER_SESSION` | 100 | LRU cap per session (env: `SPECULATIVE_CACHE_SIZE`) |
| `SESSION_COST_LIMIT` | $2.00 | Hard cap — Tier 4 disabled |
| `WARNING_THRESHOLD` | $1.60 | Warning mode — Tier 4 only for high-signal |
| `TIER2_TIMEOUT_MS` | 3,000 | Gemini timeout for Tier 2 |
| `TIER4_TIMEOUT_MS` | 1,500 | Gemini timeout for Tier 4 |
| `HOT_CACHE_MAX_PER_SESSION` | 30 | Max topics in predictive preloader hot cache |
| `MIN_WORDS_REQUIRED` | 3 | Pre-filter drop threshold |
| `TIER2_CACHE_MAX_SIZE` | 200 | Max entries in Tier 2 semantic cache |
| `GEMINI_TIER2_MODEL` | `gemini-3.1-flash-lite-preview` | Model for Tier 2 (env-overridable) |
| `GEMINI_TIER4_MODEL` | `gemini-3.1-flash-lite-preview` | Model for Tier 4 (env-overridable) |

---

## Files

```
packages/meeting-mode/src/
├── pipeline/
│   ├── engine.ts              Main orchestrator
│   ├── pre-filter.ts          Pre-filter (<10ms)
│   ├── tier1.ts               Structural detection
│   ├── tier2.ts               Small LLM classifier
│   ├── tier2-cache.ts         Embedding-based semantic cache
│   ├── tier3.ts               Embedding search (pgvector)
│   ├── tier4.ts               Deep reasoning prompt + invoke
│   ├── tier4-context.ts       Context assembly for Tier 4
│   ├── tier4-alert.ts         Alert creation + per-category thresholds
│   └── metrics.ts             Prometheus instrumentation
├── speculative/
│   ├── cache.ts               Speculative cache (Levenshtein + TTL + LRU)
│   ├── processor.ts           Partial utterance evaluator
│   ├── predictive-preloader.ts  Keyword → constraint preloader
│   └── types.ts               Priorities, thresholds, types
├── cost/
│   └── manager.ts             Per-session cost tracking + gates
└── env.ts                     Model config, API keys
```
