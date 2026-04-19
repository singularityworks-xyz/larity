# Day 21-22 Implementation Plan

## Scope

This plan covers the Day 21 and Day 22 milestones from `.context/timeline.md` and `.context/meeting-mode.md`:

- Day 21: pre-filter + Tier 1 structural detection
- Day 22: Tier 2 small LLM classification as the single semantic source

## Day 21 - Pre-filter and Tier 1

### Objectives

1. Drop noisy utterances before expensive processing.
2. Detect language-agnostic structural risk signals immediately.
3. Preserve the rule that Tier 1 is an accelerator, not a semantic gate.

### Implementation Steps

1. Add normalization and fuzzy-match primitives for deterministic matching.
2. Implement pre-filter rules:
   - <3 words drop
   - pure acknowledgements drop
   - near-duplicate recent utterance drop
3. Build Tier 1 detector with these checks:
   - date/time extraction
   - number extraction (currency, percent, quantities)
   - context-seeded blocklist matching (exact + fuzzy)
   - context-seeded client-name matching
   - technical leakage pattern detection (keys, tokens, hashes, secrets)
4. Seed Tier 1 with preloaded context payload (`keywordBlocklists`, `clientNameList`).
5. Add pre-filter + Tier 1 tests for all listed rules.

### Success Criteria

- Pre-filter drops only low-value noise and keeps meaningful utterances.
- Tier 1 emits immediate detections for structural patterns.
- Blocklist and client-name detection support fuzzy matching.

## Day 22 - Tier 2 Small LLM Classification

### Objectives

1. Add a small-model semantic classification layer via Gemini (`@google/genai`).
2. Enforce strict structured output with Zod.
3. Make Tier 2 output the single semantic source for:
   - commitment/decision writes
   - topic state deltas
   - gate decisions toward deeper reasoning

### Implementation Steps

1. Add Tier 2 schemas (`Tier2Input`, `Tier2Classification`, `topicDelta`) with Zod validation.
2. Add direct Gemini integration with:
   - model config via env (`GEMINI_TIER2_MODEL`)
   - strict JSON response expectation
   - 200ms timeout and fail-silent fallback behavior
3. Build same-speaker context retrieval from ring buffer (last 2-3 utterances).
4. Apply `topicDelta` directly to topic reducer state (deterministic updates, no per-utterance summarizer dependency).
5. Write commitments on Tier 2 intent = commitment/decision.
6. Implement gate decision from Tier 1 + Tier 2 outputs.
7. Add focused Tier 2 unit tests and end-to-end pipeline integration tests.

### Success Criteria

- Tier 2 always returns validated structured data or safe fallback.
- Same-speaker context is correctly supplied to classification.
- Topic updates are deterministic and sourced from Tier 2 `topicDelta`.
- High-signal semantic outputs route into downstream logic.

## Cross-Cutting Test Strategy

### Unit Tests

- `pipeline/pre-filter.test.ts`
- `pipeline/tier1.test.ts`
- `pipeline/tier2.test.ts`
- `topic/manager-topic-delta.test.ts`

### Integration Tests

- `pipeline/engine.integration.test.ts` (prefilter + tier1 + tier2 + ledger/topic side effects)
- Existing package integration tests re-run to ensure no regressions.

## Manual Verification Required

These scenarios require manual validation because they depend on external services or runtime behavior:

1. Gemini live API behavior with real credentials and real multilingual utterances.
2. End-to-end latency budget checks under production-like load.
3. Real-time instant Tier 1 alert surfacing in the UI.
4. Topic delta visual behavior in the actual client app.

## Completion Checklist

- [x] Day 21 pre-filter implementation
- [x] Day 21 Tier 1 structural detection
- [x] Day 22 Tier 2 classifier with schema + timeout + fail-silent
- [x] Tier 2 context bridge from ring buffer
- [x] Tier 2 topicDelta deterministic reducer wiring
- [x] Commitment write path from Tier 2 intent
- [x] Unit and integration tests aligned to implementation
- [x] Meeting-mode test suite run and passing
