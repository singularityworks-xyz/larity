# meeting-mode

Realtime meeting intelligence worker: STT finals → **`UtteranceFinalizer`** → Redis **`meeting.utterance.*`** → tiered pipeline → alerts and traces.

## Architecture (short)

- **Publish path:** Gemini **`embeddingPromise`** starts early; **`TopicManager.assignTopic`** consumes it; **`UtteranceMerger`** coalesces same-speaker lines within **`MERGE_GROUPING_MS`** (legacy **`MERGE_GAP_MS`**); pending lines flush to Redis after **`MERGE_PUBLISH_GAP_MS`** past audio end; **`onUtterancePublished`** handlers are **non-blocking** between finals; **`closeSession`** awaits in-flight handlers.
- **Pipeline:** **`evaluateUtteranceQueued`** (FIFO per **`sessionId`**) runs pre-filter → **Tier 1 ∥ Tier 2 (Groq JSON Schema) ∥ Tier 3 ∥ constraints** → gate → Tier 4 (Gemini). Context payload + cost cap use **session hot caches**; commitment/constraint ledger Redis snapshots are **debounced** (**`LEDGER_SNAPSHOT_DEBOUNCE_MS`**).
- **Spec / ADRs:** [.context/meeting-mode.md](../../.context/meeting-mode.md), [.context/architecture_decisions.md](../../.context/architecture_decisions.md) (B.14–B.18).

## Env (latency-related)

| Variable | Role |
|----------|------|
| `MERGE_GROUPING_MS` | Same-speaker merge window (fallback: `MERGE_GAP_MS`) |
| `MERGE_PUBLISH_GAP_MS` | Pending utterance publish flush after audio end |
| `LEDGER_SNAPSHOT_DEBOUNCE_MS` | Coalesce ledger snapshot `SET`s |
| `COST_CAP_CACHE_TTL_MS` | Cost gate read hot-cache TTL |
| `GROQ_TIER2_MODEL` / `GROQ_API_KEY` | Tier 2 classifier |

## Commands

```bash
bun install
bun run index.ts
bun test .
```

See repo root [**AGENTS.md**](../../AGENTS.md) for **`bun x ultracite`** formatting.
