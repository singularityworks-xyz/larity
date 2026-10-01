# Speculative Processing: What Is Actually Implemented

> **Status: OFF by default (`SPECULATIVE_ENABLED` unset).** The P3.6 go/no-go
> rule requires a measured hit-rate from dogfooding before speculation is
> enabled by default. See [Go/No-Go](#gono-go-decision) below.

Speculative processing fires a Tier 2 classification on STT **partials** so a
matching final can reuse it instead of paying for a fresh LLM call. It is a
latency/cost optimisation on top of the normal pipeline, never a requirement:
if nothing is cached (flag off, no partials, mismatch, timeout), the final
runs Tier 2 exactly as before.

## Components

| File | Role |
|------|------|
| `packages/meeting-mode/src/speculative/processor.ts` | Orchestrator — gates partials, fires async speculation, indexes results |
| `packages/meeting-mode/src/speculative/throttle.ts` | Per session+speaker speculation throttle (P3.1) |
| `packages/meeting-mode/src/speculative/cache.ts` | Speaker+trigram-indexed fuzzy-match cache (P3.4) |
| `packages/meeting-mode/src/speculative/predictive-preloader.ts` | Keyword→topic constraint pre-fetch (seeded at hydration; driven from `evaluatePartial`) |
| `packages/meeting-mode/src/pipeline/engine.ts` | Pipeline integration — hydration, cost gate, lookup, side effects |
| `packages/meeting-mode/src/subscriber.ts` | `dispatchSpeculativePartial` — the flag-gated partial call site (P3.2) |

## The Flow

```
STT partial (Redis) → subscriber.dispatchSpeculativePartial
  flag off / blank text / no engine  → stop
  flag on                            → engine.evaluatePartial
    ensureSessionHydrated            (fills P2.6 member cache)
    cost gate: session cost ≥ $1.60  → stop (counted)
    SpeculativeProcessor.processPartial
      confidence < 0.70              → stop
      speaker priority "low" (EXTERNAL) → stop
      throttle                       → stop unless: ≥500 ms since last
                                       speculation ∧ ≥4 new words ∧ no
                                       in-flight prefix
      Tier 1 structural hit (API key, blocklist, …) → cache "concern" free
      else                           → async General Compute Tier 2 call
                                        (session-cached members, P3.3)
                                        cost under `tier2_speculative`

STT final → engine.evaluateUtterance
  SpeculativeProcessor.matchSpeculation(sessionId, text, speakerId)
    hit  → reuse classification; skip LLM; apply side effects
    miss → run Tier 2 normally
```

When the classification comes from a **speculative hit**, the engine calls
`applyTier2SideEffects` explicitly so commitment persistence, topic deltas,
and semantic-cache priming still happen. Without that shared helper a hit
would silently skip all downstream consequences.

## Gate 1 — Speaker priority

`getSpeakerProcessingPriority` (in `speculative/types.ts`):

| Speaker | Priority | Speculated? |
|---------|----------|-------------|
| Current user | `high` | yes |
| Other TEAM members | `standard` | yes |
| EXTERNAL (clients) | `low` | **no** |

## Gate 2 — Throttle (P3.1)

Without throttling, every Deepgram interim would fire an LLM call — tens per
utterance. `SpeculationThrottle` keeps at most one speculation in flight per
`sessionId:speakerId` and allows a new one only when **all** hold:

1. ≥ `SPECULATIVE_THROTTLE_MIN_INTERVAL_MS` (**500 ms**) since the last speculation.
2. ≥ `SPECULATIVE_THROTTLE_MIN_NEW_WORDS` (**4**) new words since the last
   speculated text. Growing partials ("we can" → "we can deliver now") count
   only the appended tail; a divergent revision counts its full length.
3. No in-flight speculation whose text is a **prefix** of the current partial
   (an in-flight result will fuzzy-match the final anyway).

The in-flight marker is cleared on success **and** failure, so a provider
error cannot wedge a speaker permanently.

## Gate 3 — Cost (P3.5)

`evaluatePartial` reads the session cost after hydration. If
`CostManager.isWarningMode` (≥ **$1.60**) is true, speculation is skipped and
`pipeline.speculative_cost_gated_total` is incremented. Speculative spend is
the first thing to cut when the budget tightens; Tier 4 for real utterances
keeps its own gates. Hard cap remains **$2.00**.

Speculative Tier 2 spend still counts toward the session total and is
additionally accumulated under `meeting:cost:{sessionId}:tier2_speculative`
(readable via `CostManager.getTrackedCost`, cleared on `closeSession`) so the
go/no-go decision can compare it against baseline Tier 2 spend.

## The Cache (P3.4)

`SpeculativeCache` is per-session and stores `SpeculativeResult`s indexed two
ways:

- `bySpeaker: Map<speakerId, results>`
- `byKey: Map<"speakerId|first-3-normalized-words", results>`

A final with a known `speakerId` scans **only that speaker's trigram bucket**;
if the bucket is empty it widens to that speaker's other entries. It never
falls back to another speaker (cross-speaker false matches). A final with no
speaker supplied keeps the legacy whole-session scan.

Matching uses **normalized Levenshtein** distance
(`mismatchRatio = distance / max(len)`), and a candidate is a hit when
`mismatchRatio ≤ SPECULATIVE_MISMATCH_THRESHOLD` (**0.30**). This handles
speech being additive: "we can deliver by" → "we can deliver by Friday"
scores low; unrelated text scores high.

Bounds:

| Knob | Default | Meaning |
|------|---------|---------|
| `SPECULATIVE_CACHE_SIZE` | 100 | max entries per session (FIFO eviction) |
| `SPECULATIVE_TTL_MS` | 10 s | entries older than this are dropped during match |
| `SPECULATIVE_MISMATCH_THRESHOLD` | 0.30 | max accepted normalized edit distance |
| `SPECULATIVE_CONFIDENCE_THRESHOLD` | 0.70 | min STT partial confidence |

Write-path dedup uses structural comparison (`JSON.stringify`) of
classifications plus partialText/topic identity, unchanged from before P3.4.

## Metrics

| Metric | Meaning |
|--------|---------|
| `pipeline.speculative_hits_total` | final matched a cached speculation — LLM call skipped |
| `pipeline.speculative_misses_total` | final found no usable speculation (includes flag-off) |
| `pipeline.speculative_cost_gated_total` | partial skipped because session cost ≥ warning threshold |

`pipeline.speculative_discards_total` (from the previous doc) does **not**
exist in the code; a mismatch surfaces as a miss.

## Go/No-Go Decision

**Decision rule:** enable by default only if
`speculative_hits / (hits + misses) ≥ 0.40` **and** speculative Tier 2 spend
≤ 1.5× baseline Tier 2 spend.

**Current status: NO-GO (default remains OFF).** No dogfood hit-rate data
exists yet. The synthetic `mock:latency` fixture produces no Deepgram finals
(the PCM is a gated sine), so neither the speculative path nor the pipeline
runs during that harness; the ingest-path numbers with the flag on and off are
identical (drops 0, reconnects 0, orphans 0). What *is* verified is the
mechanism, by a deterministic in-repo harness
(`pipeline/engine-hitrate.test.ts`): a matching final reuses the speculation
with **one** LLM call total, an unrelated final triggers a fresh call, and the
cost gate suppresses speculation at ≥ $1.60.

To collect the data needed for the rule, run a real meeting (or `mock:latency`
with `--pcm-file` real speech) with `SPECULATIVE_ENABLED=true` and read
`pipeline.speculative_hits_total` / `_misses_total` plus
`meeting:cost:{sessionId}:tier2_speculative` versus the session's normal Tier 2
spend.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Fire-and-forget speculation | Partial handling never blocks; if not ready by the final, normal Tier 2 runs. |
| Throttle (500 ms / 4 words / prefix) | Interims arrive far faster than they can be usefully classified; one in-flight per speaker is enough. |
| Levenshtein fuzzy match | Partial speech never exactly matches final speech; edit distance handles additive transitions. |
| Speaker+trigram index | Avoids up to 100 Levenshtein comparisons per final while keeping same-speaker fallback. |
| External speakers excluded | Client small talk is the least valuable analysis target. |
| Tier 1 structural shortcut | Keywords like "NDA" or "password" need no LLM — synthetic `concern` classification. |
| Speculative cost tracking | Cost gates stay accurate; the separate track makes speculative spend auditable. |
| Cost gate cuts speculation first | When the budget tightens, spend belongs on real utterances, not speculative guesses. |
| Flag defaults off | Enabling without measured hit-rate risks paying for speculation that never gets reused. |
