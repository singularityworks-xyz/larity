# realtime

## Purpose
- Owns live WebSocket sessions for host and participants.
- Hosts the Deepgram connection for each active session.
- Relays control-plane events through Redis (session lifecycle, VAD, alerts).

## Audio Path Invariant (Day 14)
- Raw audio frames **must never** be routed through Redis.
- Audio flow is exactly one producer to one consumer: `host WebSocket -> realtime worker -> Deepgram WebSocket`.
- The realtime worker that accepts host audio must also own the Deepgram session for that `sessionId`.
- Sticky session affinity at the ingress/load balancer must route host traffic by `sessionId`.

Routing PCM through Redis adds unnecessary serialization and network latency and breaks the direct low-latency design.

## Local Development
To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```
