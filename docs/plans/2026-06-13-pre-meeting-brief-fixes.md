# Production Plan: Pre-Meeting Brief Fixes & Edge Cases

## 1. Context and Goals
This plan addresses the final production readiness concerns for the Pre-Meeting Brief feature. We will fix the remaining structural issues, address unhandled edge cases (especially ad-hoc meetings), and ensure the entire suite is tested at the unit and integration level.

## 2. Issues to Fix (The "Two Issues")
Based on the code review:
- **Issue A (Data Over-fetching):** Unbounded queries for `openTasks` and `openQuestions` will blow out the token budget. We need to cap them (`take: 15`) and order by recency.
- **Issue B (LLM Timeout & Error Handling):** The LLM call has no explicit timeout or fallback if the Gemini API hangs. We need to wrap it in an `AbortSignal.timeout` and handle graceful degradation.

## 3. Edge Cases to Handle (The "6 Edge Cases")
1. **Ad-Hoc Meetings (No historical data):** Ad-hoc meetings might have no title or participants yet. The generator must gracefully return a "First Sync" brief instead of failing.
2. **Missing Host Context:** If a meeting has no explicit host assigned, the generator shouldn't crash. It should default to the requesting user or the first participant.
3. **Task Assignment Mismatch ("Mine vs Theirs"):** Tasks currently map to "Mine" based on `participantUserIds`. This is flawed. We must map "Mine" strictly to the `requestUserId` (the person asking for the brief).
4. **Fragile Array IDs:** The UI uses `ai-lm-${idx}` for landmines, which causes React re-render issues if the array order changes. We will use `crypto.randomUUID()` during brief generation.
5. **Type Safety on Frontend:** The `toBriefStatus` function uses `any`. The `MeetingBrief` type on the frontend is missing `meetingId`. These will be typed properly.
6. **Suggested Agenda Missing from UI:** The LLM returns a `suggestedAgenda` but the Waiting Room doesn't render it. We must add this to the right column of the Waiting Room.

## 4. Implementation Steps

**Step 1: Backend Optimization & Edge Cases**
- Modify `packages/meeting-mode/src/briefs/ai-brief-generator.ts`.
- Add `take: 15` and `orderBy: { updatedAt: "desc" }` to Prisma queries.
- Fix the "Mine vs Theirs" logic using `requestUserId`.
- Replace positional IDs with `crypto.randomUUID()`.
- Wrap the Gemini call in `AbortSignal.timeout(15000)`.

**Step 2: Frontend UI & Types**
- Update `apps/desktop/src/routes/home.tsx` to remove `any` in `toBriefStatus`.
- Update `apps/desktop/src/features/meetings/use-meeting-brief.ts` to expect `meetingId`.
- Update `apps/desktop/src/routes/meeting/waiting-room.tsx` to render `suggestedAgenda`.

**Step 3: Testing**
- Run unit tests and integration tests for `meeting-mode` and `control` to verify functionality.
