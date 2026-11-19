# meeting-mode

Realtime meeting intelligence worker: STT finals → **`UtteranceFinalizer`** → Redis **`meeting.utterance.*`** → tiered pipeline → alerts and traces.

## Architecture (short)

- **Publish path:** Gemini **`embeddingPromise`** starts early; **`TopicManager.assignTopic`** consumes it; **`UtteranceMerger`** coalesces same-speaker lines within **`MERGE_GROUPING_MS`** (legacy **`MERGE_GAP_MS`**); pending lines flush to Redis after **`MERGE_PUBLISH_GAP_MS`** past audio end; **`onUtterancePublished`** handlers are **non-blocking** between finals; **`closeSession`** awaits in-flight handlers.
- **Pipeline:** `MEETING_PIPELINE_MODE=legacy` remains the default. Experimental `live` mode retrieves org/client and meeting evidence, then makes a **compact alert decision** while detailed extraction runs in parallel. Code validates evidence references, speaker attribution, confidence and routing, then publishes a template alert before extraction finishes. Two evaluations overlap per session and state updates remain ordered. Both modes retrieve org evidence text in one database round trip. See [the design and Mumbai measurements](../../docs/TIERING.md).
- **State:** context payload and cost gates use session caches; commitment/constraint Redis snapshots are debounced (`LEDGER_SNAPSHOT_DEBOUNCE_MS`).
- **Spec / ADRs:** [.context/meeting-mode.md](../../.context/meeting-mode.md), [.context/architecture_decisions.md](../../.context/architecture_decisions.md) (B.14–B.18).

## Env (latency-related)

| Variable | Role |
|----------|------|
| `MERGE_GROUPING_MS` | Same-speaker merge window (fallback: `MERGE_GAP_MS`) |
| `MERGE_PUBLISH_GAP_MS` | Pending utterance publish flush after audio end |
| `LEDGER_SNAPSHOT_DEBOUNCE_MS` | Coalesce ledger snapshot `SET`s |
| `COST_CAP_CACHE_TTL_MS` | Cost gate read hot-cache TTL |
| `MEETING_PIPELINE_MODE` | `legacy` (default) or experimental `live` |
| `LIVE_PIPELINE_CONCURRENCY` | Per-session overlap, default 2, clamped to 1–4 |
| `GEMINI_TIER4_MODEL` / `GEMINI_TIER4_TIMEOUT_MS` | Contextual analyzer and inference deadline |
| `GENERALCOMPUTE_TIER2_MODEL` / `GENERALCOMPUTE_API_KEY` | Detailed classification/extraction in both modes |

## Commands

```bash
bun install
bun run index.ts
bun test .
```

See repo root [**AGENTS.md**](../../AGENTS.md) for **`bun x ultracite`** formatting.
