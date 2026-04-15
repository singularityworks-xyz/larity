# Larity Architecture Decisions & Suggestions

This document tracks architectural decisions, technical tradeoffs, and implementation suggestions as we progress through the Day 9 to Day 30 timeline.

### Day 9: Server-Side Diarization Correlation
**Decision:** `SpeakerIdentifier` State Persistence
- **Context:** Identifying speaker identity correlations correctly requires caching previous identifications for the exact `diarizationIndex` Deepgram provides across a session.
- **Tradeoff:** Storing this entirely in-memory on the NodeJS server means if the realtime node restarts or crashes, we lose the mapping.
- **Decision:** As specified in the timeline, we will persist this identity mapping (`diarizationIndex -> SpeakerIdentity`) into a Redis Hash at `meeting.speaker.{sessionId}`. When a session boots or a late-joining user connects, they can hydrate their speaker layout seamlessly from this central ledger.

**Decision:** Buffer Management for Ambiguous Utterances
- **Context:** An utterance comes in at `t=5000`, but network latency delays the VAD signal from the desktop client until `t=5500`.
- **Decision:** 
  1. We immediately emit the utterance flagged as `EXTERNAL` to ensure < 50ms latency to the user.
  2. We push it into a `pendingBuffer` up to a maximum duration (`~2s`).
  3. If VAD belatedly confirms it was a TEAM member, we emit an updated copy of the utterance with the corrected mapping. The client must be built to support overriding recent utterances by `utterance.id`.
