# Speculative Processing: Pre-Computing the Future

## The Problem: Real-Time AI Has a Physics Problem

Real-time meeting analysis has an impossible constraint: you cannot fire an alert before the speaker finishes their sentence. But once they finish, the analysis pipeline needs to run — fast enough that alerts feel instantaneous, not like a 2-second lag.

At the same time, you can't afford to run a full LLM pipeline on every utterance. A 90-minute meeting with 4 participants can generate 600+ utterances. If each one hits Tier 2 (LLM intent classification) and potentially Tier 4 (deep reasoning with Gemini Pro), the cost per meeting could exceed $50 — completely non-viable for a product targeting professional teams.

The naive approaches all fail:

| Approach | Problem |
|----------|---------|
| **Wait for final, then process** | 200-400ms pipeline latency feels sluggish; alerts lag behind conversation flow |
| **Run LLM on every utterance** | $50+/meeting; cost-ineffective as a product |
| **Cache only exact matches** | Partial speech ("We can deliver by...") never exactly matches final speech ("We can deliver by Friday") |
| **Skip the LLM entirely** | Misses intent classification, risk signals, and commitment detection |

Speculative processing solves this by running the pipeline **before the utterance is final**, effectively stealing time from the speaker's sentence completion.

## Architecture: Three Components, One Strategy

```
Speaker is talking →
  ┌─────────────────────────────────────────────────────────────┐
  │                    SpeculativeProcessor                     │
  │  "Start classifying before they're done speaking"           │
  │                                                             │
  │  Partial arrives (confidence ≥ 0.7)                         │
  │    ├─ Speaker is EXTERNAL (client)? → SKIP (save costs)     │
  │    ├─ Tier 1 structural hit? → bypass LLM, cache "concern"  │
  │    └─ Otherwise → fire Tier 2 LLM speculatively, cache      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                     SpeculativeCache                        │
  │  "Fuzzy-match the partial we pre-computed to the final"     │
  │                                                             │
  │  Final arrives → Levenshtein distance against all cached    │
  │    partials → pick best match                               │
  │    ├─ Mismatch ≤ 30% → HIT: return pre-computed result      │
  │    └─ Mismatch > 30% → MISS: run Tier 2 normally            │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   PredictivePreloader                       │
  │  "Pre-fetch constraints before they're needed"              │
  │                                                             │
  │  Keywords in partial text → predict topic domain            │
  │    → pre-fetch policy constraints + agenda items            │
  │    → ready in session hot cache when pipeline needs them    │
  └─────────────────────────────────────────────────────────────┘
```

### Component 1: `SpeculativeProcessor`

The orchestrator. When the STT engine produces a partial (non-final) utterance, the processor makes a snap decision: is this worth speculating on?

Three gates must pass:

1. **Confidence gate (≥ 70%):** If the STT engine isn't confident in the transcription, speculation is likely garbage. Skip.
2. **Speaker priority gate:** External speakers (clients) are `low` priority — their partials are never speculated on. This alone eliminates speculative LLM cost on the least valuable analysis targets.
3. **High-signal shortcut:** If Tier 1's structural detector finds keywords like "password", "confidential", "NDA", "contract", or "budget" in the partial text, the processor skips the LLM entirely. It creates a synthetic `intent: "concern"` classification with 90% confidence and caches it immediately. This is essentially free — a regex-level detection that pre-empts an LLM call.

If all gates pass, the processor fires an **async, fire-and-forget** Tier 2 LLM call. This is critical: the partial processing never blocks the pipeline. If the speculative result isn't ready when the final utterance arrives, the system silently falls through to the normal Tier 2 path. No latency penalty.

Every speculative LLM call records its token costs via the `CostManager`. This means speculative work properly contributes to the session budget — cost gates remain accurate even when speculative work is consuming GPU time.

### Component 2: `SpeculativeCache`

An in-memory, per-session cache that stores pre-computed Tier 2 classifications. When the final utterance arrives, the cache finds the best matching partial — not by exact text match, but by **normalized Levenshtein distance**.

The matching algorithm:

1. Normalize both partial and final text (lowercase, strip non-alphanumeric, trim)
2. Scan all cached results for the session, newest first
3. Compute `mismatchRatio = levenshteinDistance(normalizedPartial, normalizedFinal) / max(len(partial), len(final))`
4. Return the candidate with the lowest ratio
5. Ratio ≤ 0.3 (30% threshold) → **cache hit**, return pre-computed result
6. Ratio > 0.3 → discard; runs Tier 2 normally

This handles natural speech transitions like "We can deliver by" → "We can deliver by Friday afternoon" (minor addition, low mismatch), while correctly rejecting "Nice weather" → "The quarterly budget report" (completely different topic, high mismatch).

The cache has two safety mechanisms:
- **TTL-based expiry (10 seconds):** Results older than 10s are evicted during matching. This prevents stale classifications from matching utterances that arrive long after the speaker finished.
- **LRU eviction:** Maximum 100 entries per session (configurable via `SPECULATIVE_CACHE_SIZE`). When full, the oldest entry is dropped.

Deduplication is based on structural equality of classifications (`JSON.stringify`), not reference equality. This was a subtle but critical fix — reference equality was dead code, never matching real duplicate results.

### Component 3: `PredictivePreloader`

A separate optimization that predicts which policy constraints and agenda items will be relevant based on keywords in the partial text, then pre-fetches them from a session-scoped hot cache.

It maps 6 topic domains to keyword sets:

| Domain | Sample Keywords |
|--------|----------------|
| `pricing` | price, cost, budget, fee, rate, invoice, discount |
| `timeline` | deadline, delivery, launch, milestone, schedule, sprint |
| `scope` | scope, feature, requirement, deliverable, phase, epic |
| `legal` | contract, nda, compliance, gdpr, hipaa, regulation |
| `security` | security, vulnerability, breach, encryption, auth |
| `resource` | resource, team, hire, headcount, capacity, bandwidth |

On session hydration, the preloader seeds the hot cache from meeting context: active policy guardrails and calendar agenda items. When keywords are detected in speech, matching constraints are pre-fetched with a 5-minute access TTL. The cache is LRU-evicted at 30 entries per session.

Constraint IDs from agenda items use SHA-256 content hashing — a fix that replaced a brittle `base64.slice(0, 12)` approach that produced collisions on shared-prefix agenda items.

## How It Saves Costs

### Direct LLM Cost Elimination

When a speculative cache hit occurs, Tier 2's LLM call is completely skipped. The Gemini model that Tier 2 uses costs per token — every miss costs real money. With ~85% of speculative work being usable (as measured in production), the system skips roughly 5 out of every 6 Tier 2 LLM calls. For a 90-minute meeting with 600 utterances, that's ~500 LLM calls eliminated.

At current Gemini pricing, this represents significant per-meeting savings.

### Speaker-Aware Cost Gating

Not all speech is worth the same cost:

| Speaker | Priority | Speculative Processing | Tier 4 Threshold |
|---------|----------|----------------------|------------------|
| Current user | `high` | Yes | 0.70 confidence |
| Other team members | `standard` | Yes | 0.80 confidence |
| External (clients) | `low` | **No** | 0.85 confidence |

External speakers never trigger speculative processing at all, and their Tier 4 deep reasoning has the highest confidence bar. This is a heuristic that saves significant cost: client speech is analyzed for risks and commitments, but the system won't speculate on partial client utterances or deep-reason on borderline signals.

### Tier 1 Bypass (The "Free" Classification)

When keywords like "password", "confidential", "NDA", "contract", or "compliance" are detected in partial text, the system creates a synthetic classification without any LLM call. This is a regex-level optimization that handles a surprisingly large portion of high-risk utterances. A "That violates our NDA" utterance that would normally trigger Tier 2 + Tier 4 can be flagged by Tier 1 alone, saving both model calls.

### Budget-Accurate Speculative Work

Speculative LLM calls record their token costs immediately. This prevents a dangerous accounting gap: if speculative work consumed GPU time without affecting the budget, the cost gates (`$1.60` warning, `$2.00` hard cap) would be inaccurate. The session might enter warning mode with Tier 4 suppressed, even though speculative work had already consumed the budget. By integrating speculative costs into the `CostManager`, the system always knows its true spend.

### Dual-Layer Caching

The speculative cache isn't the only cache. There's also a `Tier2SemanticCache` — an embedding-based cache that stores Tier 2 results for exact semantic matches. Together they form a multi-level hierarchy:

```
Final utterance arrives
  → Speculative cache (text-match, Levenshtein) → HIT? Done.
  → Semantic cache (embedding-match) → HIT? Done.
  → Tier 2 LLM call → expensive, but necessary
```

The speculative cache handles partial→final fuzzy matching. The semantic cache handles repeated similar sentences. Together they cover a large portion of the cost surface.

## The Out-of-the-Box Thinking

### 1. Fire-and-Forget LLM Calls

The `speculate()` method is called asynchronously without awaiting. This means partial processing **never blocks the pipeline**. If the speculative result isn't ready when the final utterance arrives (network latency, model queueing), the system falls through to normal Tier 2 processing. No latency penalty. This is a "free speculation" design — you can't lose, you can only win.

### 2. Levenshtein for Speech, Not Text

Exact string matching is useless for partial speech. The system uses normalized Levenshtein distance — an edit distance algorithm — to compute a mismatch ratio. This elegantly handles the fact that speech is additive: "We can deliver by Friday" absorbs "We can deliver by" as a 2-word extension (low mismatch), while "Nice weather" → "The quarterly budget" is a completely different sentence (high mismatch).

### 3. VAD-Correlation Enables Speaker-Aware Prioritization

Speaker identity is determined through VAD correlation (see [VAD.md](./VAD.md)), not voice embeddings. Because every team member runs the Larity desktop app, the server knows who is speaking without ML. This "free" speaker identity enables the entire speaker-aware cost gating system — external speakers don't trigger speculation, and their Tier 4 threshold is higher. Without VAD correlation, speculation would be blind to who is speaking and would waste LLM calls on client small talk.

### 3.1 Hybrid Partial/Final Speaker Mapping

Speaker attribution now resolves in two stages:

- **Partial stage:** STT partial events create short-lived provisional diarization-to-user candidates using VAD interval overlap.
- **Final stage:** STT final events confirm (or override) attribution, then publish canonical speaker identity.

This reduces attribution drift when final segments are delayed (for example 3-8 seconds) while keeping speculative processing non-blocking. Tiering and cost gating continue to consume the final canonical speaker identity, with retroactive correction still available for late VAD arrival.

### 4. Side Effects Run Regardless of Source

A critical design insight: commitment persistence, topic delta application, and semantic cache priming are **side effects** that must run whether the Tier 2 classification came from a speculative cache hit or a real LLM call. The `applyTier2SideEffects` method is extracted as a shared helper that both paths call. Without this, speculative cache hits would correctly return the classification but silently skip all downstream consequences — commitments wouldn't be recorded, topics wouldn't shift, and the semantic cache wouldn't be primed.

### 5. Session Hydration Before Speculation

The pipeline ensures the session is fully hydrated (constraints loaded, commitments loaded, context payload fetched) before speculative partial processing begins. This means Tier 1 has seeded context from the start, and the predictive preloader has session constraints available immediately. Without this ordering, speculative work on early utterances would run against an uninitialized session and produce incorrect results.

### 6. Structure-Aware Deduplication

Cache dedup uses `JSON.stringify` structural comparison on classifications, not reference equality. The codebase originally used `===`, which never matched because different speculative results are different object references even when structurally identical. This subtle bug would have caused duplicate results to pile up, wasting cache space and potentially matching the wrong partial to the final text.

## Complications and Edge Cases Handled

### The 30% Mismatch Threshold

Tuning `SPECULATIVE_MISMATCH_THRESHOLD = 0.3` is critical. Too high (e.g., 0.5) and the system accepts poor matches, applying the wrong classification to utterances. Too low (e.g., 0.1) and almost nothing matches, defeating the purpose of speculation. The 30% threshold was empirically determined to balance hit rate against accuracy.

### TTL Cleanup During Matching

Expired entries aren't cleaned up on a timer — they're evicted in-place during matching via `array.splice()`. This lazy cleanup approach avoids the overhead of a background timer while ensuring stale results never match. The `SpeculativeMatch` return type includes the `mismatchRatio` even on misses, enabling metrics to distinguish between "no speculative work was attempted" (mismatchRatio = 1) and "speculative work existed but was discarded" (mismatchRatio between 0.31 and 0.99).

### Confidence Gating at 0.7

Partial utterances below 70% STT confidence never trigger speculation. This prevents wasting LLM calls on garbled, low-quality audio. The heuristic is simple but effective: if the STT engine isn't confident in what was said, the LLM won't produce useful analysis.

### Cost Recording Resilience

Both the speculative LLM call and its cost recording are wrapped in separate try-catch blocks. If the LLM call fails, it's logged at `warn` and the pipeline continues. If the cost recording fails (Redis down, network issue), it's logged separately and the in-memory cost tracker is used as fallback. Neither failure propagates to the main pipeline.

### Empty Text Edge Cases

Both the cache and processor handle edge cases where `normalizeAlphaNumeric` produces an empty string (text that is all punctuation, symbols, or whitespace). Empty texts always return no-match, preventing the Levenshtein algorithm from dividing by zero or producing misleading ratios.

### Constraint ID Collisions

The original implementation used `base64.slice(0, 12)` for agenda constraint IDs, which collided on items with shared prefixes. The fix uses SHA-256 content hashing, producing collision-resistant IDs even for near-identical agenda items.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Fire-and-forget async speculation | Partial processing never blocks the pipeline. If not ready by final → normal Tier 2. Zero downside. |
| Levenshtein distance over exact match | Partial speech never exactly matches final speech. Edit distance handles additive transitions naturally. |
| Speaker-aware gating | Client speech is the least valuable analysis target. External gating prevents speculative cost on client small talk. |
| Tier 1 structural shortcuts | Keywords like "NDA", "confidential" don't need an LLM. Regex-level detection with synthetic classification. |
| Speculative cost tracking | Without it, cost gates are inaccurate. Speculative work drains the budget just like normal processing. |
| Extracted `applyTier2SideEffects` | Side effects must run for both speculative hits and real LLM calls. Shared helper prevents divergence. |
| Session hydration before speculation | Speculative work on an uninitialized session produces incorrect results. Ordering matters. |
| Lazy TTL eviction during matching | Avoids background timer overhead. Expired results evicted during lookup, not on a schedule. |
| Structural dedup over reference equality | `JSON.stringify` comparison catches duplicate classifications that `===` misses. |

## Metrics

Three Prometheus counters track speculative performance:

| Metric | Meaning |
|--------|---------|
| `pipeline_speculative_hits_total` | Speculative cache hits — Tier 2 LLM call skipped |
| `pipeline_speculative_discards_total` | Speculative result existed but mismatch exceeded 30% |
| `pipeline_speculative_misses_total` | Defined but not incremented (gap — reserved for full misses) |

A rising hit/discard ratio indicates effective speculation. A falling ratio could indicate environment changes (more external speakers, lower STT quality, faster speech pace) that reduce speculative effectiveness.

## Directory Reference

| File | Role |
|------|------|
| `packages/meeting-mode/src/speculative/types.ts` | Types, constants, thresholds, speaker priority logic |
| `packages/meeting-mode/src/speculative/processor.ts` | Main orchestrator — gates partials, fires async speculation |
| `packages/meeting-mode/src/speculative/cache.ts` | Levenshtein-based fuzzy matching cache |
| `packages/meeting-mode/src/speculative/predictive-preloader.ts` | Keyword-based constraint pre-fetching |
| `packages/meeting-mode/src/pipeline/engine.ts` | Pipeline integration — speculative lookup + side effects |
| `packages/meeting-mode/src/pipeline/metrics.ts` | Prometheus metrics for hits, misses, discards |
| `packages/meeting-mode/src/pipeline/text-utils.ts` | `levenshteinDistance` and `normalizeAlphaNumeric` |
| `packages/meeting-mode/src/cost/manager.ts` | Cost tracking — speculative LLM costs integrated into budget |
