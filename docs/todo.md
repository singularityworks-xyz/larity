# Larity Project TODOs

This document tracks pending features, refactoring tasks, and technical debt in the Larity codebase.

## Active Todo Items

### 1. Functionalize "Remember This" Feature
The "Remember This" feature in the meeting mode UI and overlay is currently a frontend-only placeholder/stub. It needs to be integrated with the backend pipeline to capture and structure the last ~30 seconds of meeting audio/context when the capture pipeline runs.

**Current Stubs:**
- **Meeting Session UI:** The `handleRememberThis` function in [apps/desktop/src/routes/meeting/$session-id.tsx](file:///home/haze/repos/larity/apps/desktop/src/routes/meeting/$session-id.tsx#L803-L808) currently only triggers a temporary local banner message via `setRememberBanner(...)` for 8 seconds.
- **Overlay UI:** The `handleRememberThis` callback in [apps/desktop/src/features/overlay/use-overlay-data.ts](file:///home/haze/repos/larity/apps/desktop/src/features/overlay/use-overlay-data.ts#L90-L93) sets a temporary 2-second visual flash via `setRememberFlash(true)`.

**Next Steps / Required Work:**
1. Connect `handleRememberThis` to a backend API endpoint (e.g., `/meeting-session/:sessionId/remember`) or broadcast a WebSocket event to the server.
2. Implement backend logic to bookmark the current timestamp or isolate the preceding ~30 seconds of speech-to-text context.
3. Integrate this bookmarked context into the meeting capture and structured summarization pipeline.

Link meeting scheduling with Google Calendar and Mail.