# Pre-Meeting Brief Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the critical bugs and architectural edge cases in the pre-meeting brief flow, ensuring safe backgrounds execution and handling of ad-hoc meetings.

**Architecture:** We will address crashing imports, abstract the shared AI brief generator into `packages/meeting-mode`, implement Redis locking for concurrent requests, apply Zod validation to database reads, cap prompt lengths, and fix the "new client hallucination" edge case cleanly.

**Tech Stack:** Bun, Prisma, BullMQ, Zod, Redis, Gemini via @google/genai.

---

### Task 1: Fix ESM/CJS Cron Crash

**Files:**
- Modify: `apps/control/src/server.ts`

**Step 1: Fix `require` crash in cron**
The `server.ts` uses an inline `require` to import `Prisma.DbNull` inside an ESM setup, which throws. Move the import to the top of the file statically.

```ts
// At top of file:
import { Prisma } from "@larity/infra/prisma/generated/prisma/client";

// In the cron job logic:
preMeetingBrief: { equals: Prisma.DbNull }
```

**Step 2: Commit**
```bash
git add apps/control/src/server.ts
git commit -m "fix(control): use static import for Prisma.DbNull in cron to prevent ESM crash"
```

---

### Task 2: Move AI Brief Generator to Shared Package

**Files:**
- Create: `packages/meeting-mode/src/briefs/ai-brief-generator.ts`
- Modify: `packages/meeting-mode/src/index.ts`
- Modify: `apps/workers/src/pre-meeting-brief.worker.ts`
- Modify: `apps/control/src/services/meeting-brief.service.ts`
- Delete: `apps/control/src/services/ai-brief-generator.service.ts`

**Step 1: Create shared generator**
Move the exact logic of `AIBriefGeneratorService` from `apps/control/src/services/ai-brief-generator.service.ts` into `packages/meeting-mode/src/briefs/ai-brief-generator.ts`.
Ensure it imports `prisma` from `@larity/infra/prisma` directly:
```ts
import { prisma } from "@larity/infra/prisma";
```

**Step 2: Export from package**
In `packages/meeting-mode/src/index.ts`, add:
```ts
export * from "./briefs/ai-brief-generator";
```

**Step 3: Update Consumers and Delete old file**
Update `workers/src/pre-meeting-brief.worker.ts` and `control/src/services/meeting-brief.service.ts` to import `AIBriefGeneratorService` from `meeting-mode`.
Delete `apps/control/src/services/ai-brief-generator.service.ts` via `rm`.

**Step 4: Commit**
```bash
git add packages/meeting-mode apps/workers apps/control
git commit -m "refactor: extract AIBriefGeneratorService into meeting-mode shared package"
```

---

### Task 3: Fix "Mine vs Theirs" Assignment Bug

**Files:**
- Modify: `packages/meeting-mode/src/briefs/ai-brief-generator.ts`

**Step 1: Pass `userId` and use it for task filtering**
Change `generateBriefData(meetingId: string, requestUserId?: string)` to accept the user ID of the person asking for the brief.

**Step 2: Fix task logic**
Replace:
```ts
const mineTasks = openTasks.filter((t) => t.assigneeId && participantUserIds.includes(t.assigneeId));
```
With:
```ts
const mineTasks = openTasks.filter((t) => t.assigneeId === requestUserId);
const theirsTasks = openTasks.filter((t) => t.assigneeId !== requestUserId);
```

**Step 3: Commit**
```bash
git add packages/meeting-mode/src/briefs/ai-brief-generator.ts
git commit -m "fix(briefs): use actual requesting user for 'mine' vs 'theirs' task categorization"
```

---

### Task 4: Fix Unbounded Queries & Empty Hallucinations

**Files:**
- Modify: `packages/meeting-mode/src/briefs/ai-brief-generator.ts`

**Step 1: Cap tasks and questions to prevent context limit bloat**
In the `Promise.all` Prisma queries for `openTasks` and `openQuestions`, add `take: 15`.

**Step 2: Handle Empty Context Edge Case**
After fetching arrays, add a short-circuit before formatting the prompt:
```ts
if (pastMeetings.length === 0 && openTasks.length === 0 && landmines.length === 0 && openQuestions.length === 0) {
  return {
    tldr: "This is your first meeting with this client. No historical context is available.",
    sentiment: "Neutral",
    suggestedAgenda: [],
    landmines: [],
    commitments: { mine: [], theirs: [] }
  };
}
```

**Step 3: Commit**
```bash
git add packages/meeting-mode/src/briefs/ai-brief-generator.ts
git commit -m "fix(briefs): cap context queries and short-circuit empty histories to prevent hallucinations"
```

---

### Task 5: Zod Validation & Fallback Race Conditions

**Files:**
- Modify: `apps/control/src/services/meeting-brief.service.ts`
- Create: `packages/meeting-mode/src/briefs/schema.ts`

**Step 1: Create Schema**
Create a Zod schema `MeetingBriefSchema` inside `packages/meeting-mode/src/briefs/schema.ts` to represent the JSON object. 

**Step 2: Add Redis Locking and Zod Parsing to MeetingBriefService**
In `MeetingBriefService.generateBrief(meetingId: string, userId: string)`:
1. Try parsing `meeting.preMeetingBrief` with Zod. If it passes, return it.
2. If it fails or is null, acquire a Redis lock using `SET brief:lock:${meetingId} 1 EX 30 NX`.
3. If lock acquired, call `AIBriefGeneratorService.generateAndSaveBrief`.
4. If lock denied, wait 2 seconds and re-fetch from DB, looping up to 3 times.

**Step 3: Commit**
```bash
git add apps/control/src/services/meeting-brief.service.ts packages/meeting-mode/src/briefs/schema.ts
git commit -m "feat(control): add Zod validation and Redis locking to on-demand brief generation"
```

---

### Task 6: BullMQ Deduplication for Cron

**Files:**
- Modify: `apps/control/src/server.ts`

**Step 1: Add jobId to enqueue params**
Change the cron job's `add()` call:
```ts
await preMeetingBriefQueue.add(
  "generate", 
  { meetingId: meeting.id }, 
  { jobId: `pre-meeting-brief-${meeting.id}` }
);
```
This ensures an unchanged meeting scheduled 20 hours out isn't queued 20 times.

**Step 2: Commit**
```bash
git add apps/control/src/server.ts
git commit -m "fix(control): apply BullMQ job deduplication to pre-meeting brief cron"
```
