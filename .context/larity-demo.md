# Larity — 1-Minute Demo Video: Production Plan

> Target quality bar: Cluely / Linear / Vercel launch video. Not a feature tour. A feeling.

---

## The Narrative Strategy

The video does **not** say "AI meeting assistant". It shows a problem that every person watching instantly recognizes — and then silently proves Larity solves it. No voiceover hype. No feature bullets. Just the product doing the thing.

**The emotional arc:**
```
Familiar pain → Silent intelligence → Moment of relief → Memory that lasts
```

**The one sentence this video communicates:**
> *Your meetings forget everything that mattered. Larity doesn't.*

---

## Tone & Visual Direction

| Signal | Instruction |
|---|---|
| **Aesthetic** | Dark, flat, precision. No fluff. Vercel-meets-Bloomberg-Terminal energy |
| **Pace** | Fast but not rushed. Intentional cuts. Nothing lingers past its purpose |
| **Text on screen** | Sparse. Two or three words, max. Never explain — just label |
| **Color** | The product's own palette: pure black, white, violet/teal gradient blooms |
| **Music** | Understated ambient electronic — think Max Richter or Ólafur Arnalds crossed with Floating Points. NOT corporate SaaS music |
| **Voice** | None. Or a single line of whispered narration at the very end. |
| **Feel** | Intelligence. Calm. Like Larity already knows. |

---

## The Shot-by-Shot Storyboard

### ACT I — The Problem (0:00 – 0:08)

> **Goal:** Make the viewer nod before Larity appears. Get in, get out.

---

**Shot 1 · 0:00–0:05 · The Contradiction**

*Screen: a Google Meet call. Standard video grid. Looks like every meeting you've ever been in.*

*A transcript-style caption appears bottom-left, monospace:*
```
Client (0:09):  "...budget's around $50k, that's what we have approved."
```

*The call continues. People nod. Someone types a note.*

*A scrub bar at the bottom of the screen fast-forwards — 42 minutes in about 1.5 seconds. The call blurs past.*

```
Client (0:51):  "...so keeping this under $35k is what we'd need to make work."
```

*Freeze. The video grid stays frozen. Nobody in it reacts.*

**Text fades in, centre, white:**
```
$15,000 gap.
42 minutes apart.
Nobody caught it.
```

*Hard cut to black.*

---

**Shot 2 · 0:05–0:08 · The Name**

*Pure black screen.*

*Wordmark appears, center, letter-spacing wide:*
```
L A R I T Y
```

*Below it, after a 0.4s beat:*
```
Work, with memory.
```


*The violet gradient bloom rises once, softly. Fades. Cut.*


### ACT II — Meeting Mode Live (0:08 – 0:38)

> **Goal:** Show the alerts doing the work. The overlay is the protagonist.

---

**Shot 3 · 0:08–0:14 · The Overlay**

*Full desktop — Google Meet in the background. The Larity overlay is already there, dark, 360px, violet gradient breathing softly at the bottom. It didn't announce itself.*

Overlay shows:
- Heartbeat dot pulsing violet-teal
- Topic: `Commercial Terms`
- Constraint counter: `C: 4`
- Speaker pill: `Sarah · EXTERNAL`

*The call audio continues under it. Normal conversation. Nobody knows what's coming.*

**On-screen text (lower-left, monospace, 11px):**
```
OS-level audio. No extension.
Works on Zoom, Meet, Teams — anything.
```

*Fades after 3s.*

---

**Shot 4 · 0:14–0:24 · Scope Creep Alert**

*Client says: "...we were thinking the scope could include the mobile app as well..."*

*Alert slides in from the right — spring, micro-overshoot. Left rail: blue-violet.*

```
┌─────────────────────────────────────────┐
│ ▌ SCOPE CREEP                      0:15 ✕│
│ ▌ Mobile app not in agreed scope          │
│ ▌ 💡 Reference the signed SOW — §3.2     │
│ ▌ Sarah (EXTERNAL)            Evidence ▾ │
└─────────────────────────────────────────┘
```

*User clicks `Evidence ▾`. The card expands — the source utterance renders beneath it, timestamp highlighted:*

```
│ ▌ ———————————————————————————— │
│ ▌ Sarah (0:14:52): "...we were thinking   │
│ ▌ the scope could include the mobile      │
│ ▌ app as well, if that's feasible"        │
│ ▌ Tier 4 · confidence 0.94                │
```

*The evidence is right there. The reasoning is right there. No switching tabs, no scrolling.*

**On-screen text:**
```
Every alert. Source-linked.
Evidence one click away.
```

*Hold 3s.*

---

**Shot 5 · 0:24–0:36 · The Budget Contradiction — The Moment**

*Client says: "...so keeping this under $35k is what we'd need."*

*Second alert fires. Stacks below the first. Danger rail — the gradient blooms red-violet, visibly more intense than before.*

```
┌─────────────────────────────────────────┐
│ ▌ CLIENT BACKTRACK           CRITICAL ✕│
│ ▌ Budget now $35k — stated $50k at 0:09  │
│ ▌ 💡 Confirm revised budget before         │
│ ▌    proceeding with scope               │
│ ▌ Sarah (EXTERNAL)            Evidence ▾ │
└─────────────────────────────────────────┘
```

*Gradient is red-violet now. Pulsing slightly. The overlay feels different — urgent.*

*Footer badge: `+1 queued`*

**On-screen text — hold this for 5 full seconds:**
```
$15,000 gap.
42 minutes of memory.
Instant.
```

---

**Shot 6 · 0:36–0:38 · Ledger Flash**

*Quick pan — 2 seconds, no on-screen text. The sidebar commitment ledger visible:*

```
 Budget: $50k   Sarah  0:09  CONTRADICTED
 Mobile scope   Priya  0:15  CONFIRMED
```

*Just enough to show it exists. Cut.*

---

### ARCHITECTURE SEGMENT (0:38 – 0:56) — Voiceover + Diagram

> **Goal:** Answer "how does it actually know that?" right after the contradiction alert lands. 18 seconds. One take of voiceover.

---

**Shot 7 · 0:38–0:56 · Under the Hood**

*Hard cut to black. The architecture diagram fades in — dark background, Larity's own visual language. Nodes animate in as the voiceover mentions them.*

**Diagram (animated, node by node):**

```
┌──────────────────────────────────────────────────┐
│                  HOST MACHINE                    │
│  [ Microphone · Ch.0 ]  [ OS Audio · Ch.1 ]     │
│              └──────────┬───────────┘            │
│                   Tagged mono PCM                 │
└──────────────────────────┬───────────────────────┘
                           │ WebSocket
                           ▼
               ┌───────────────────────┐
               │     REALTIME SERVER   │
               │  Deepgram STT × 2     │
               │  VAD correlation  ────│── speaker identity
               │                       │
               │  T1: Pattern  ┐        │
               │  T2: Intent   ├─ ///  │  parallel
               │  T3: Novelty  ┘        │
               │        ↓               │
               │  T4: Reasoning LLM    │  ~8× / meeting
               └──────────┬────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
       Overlay         Memory        Post-meeting
       alerts          writes        extraction
```

**Voiceover script (record once, ~18s):**
> *"Larity captures dual-channel audio at the OS level — your mic and your speakers, regardless of which meeting platform you're on. That audio runs through a four-tier intelligence pipeline. The first three tiers run in parallel. The fourth — the reasoning layer — fires about eight times per meeting. Speaker identification is VAD timestamp correlation. No voice models. No enrollment."*

**Recording notes:**
- Calm, matter-of-fact — not excited
- Music drops to near-silence or -18db under the voiceover
- No on-screen text labels beyond the diagram itself

---

### ACT III — After the Meeting (0:56 – 1:14)

> **Goal:** The flywheel. Memory → extraction → walks into the next meeting prepared.

---

**Shot 8 · 0:56–1:02 · Post-Meeting Extraction**

*Meeting ends. Hard cut to Larity desktop — post-meeting view.*

*Status pill animates live: `PROCESSING` → `READY`*

*Tabs load:*
```
Decisions    Commitments    Tasks    Open Questions    Alerts
```

*Decisions tab in focus:*
```
DECISIONS
  Budget: $50k stated — contradicted to $35k    [Evidence ▾]
  STATUS: UNRESOLVED · Requires confirmation

  Mobile app excluded from scope                  [Evidence ▾]
  STATUS: ACTIVE
```

**On-screen text:**
```
Every decision extracted.
Every contradiction flagged.
```

---

**Shot 9 · 1:02–1:14 · The Pre-Meeting Brief**

*Hard cut. New surface — cleaner, wider. A pre-meeting brief sheet loading.*

*Header:*
```
Acme Corp · Follow-up: Commercial Review
Tomorrow · 10:00 AM · Sarah Mitchell + 2 others
```

*Sections load in, staggered:*

```
OPEN FROM LAST TIME
  ⚠ Budget contradiction unresolved
    Sarah stated $50k at 0:09, revised to $35k at 0:51
    → Confirm before discussing any scope

  ✓ Mobile app exclusion — confirmed, documented

  KNOWN CONSTRAINTS
  NDA: Do not reference competitor pricing
  Approved terminology: "engagement" not "project"

TALKING POINTS · Alex
  → Resolve budget ambiguity first — everything else depends on it
  → SOW §3.2 covers mobile scope explicitly if challenged
```

*The brief is dense, precise, and ready. Bottom of screen:*
```
[ Start meeting mode ]
```

**On-screen text:**
```
Walks into every meeting
already prepared.
```

---

### ACT IV — The Close (1:14 – 1:18)

---

**Shot 10 · 1:14–1:17 · The Statement**

*Black screen. Three lines, staggered 0.35s apart:*

```
Larity listens while you talk.
Warns before you misstep.
Remembers what everyone else forgets.
```

---

**Shot 11 · 1:17–1:18 · The CTA**

*Wordmark. URL. One violet bloom.*
```
L A R I T Y
larity.xyz
```

*Fades to black.*

---

## Pacing Map

```
0:00 ─── Act I: The Pain ─────────────────────── 0:08
0:08 ─── Act II: Meeting Mode ────────────────── 0:38
0:38 ─── Architecture Segment ────────────────── 0:56
0:56 ─── Act III: Post + Pre ─────────────────── 1:14
1:14 ─── Act IV: The Close ───────────────────── 1:18
```

| Segment | Duration | Format | Feel |
|---|---|---|---|
| I — Pain | 8s | Pure screen + text | Instant recognition |
| II — Meeting Mode | 30s | Pure screen + text | Alerts as protagonist |
| Architecture | 18s | Voiceover + diagram | Credibility, depth |
| III — Post + Pre | 18s | Pure screen + text | The full flywheel |
| IV — Close | 4s | Pure screen + text | Quiet confidence |

**Total: ~78 seconds. 11 shots.**

---

## Production Approach

### Option A — Timeline-Scripted Demo Mode (Chosen Approach)

Instead of relying on a live confederate or real pipeline data, build a **demo automation script** — a TypeScript timeline that fires the exact same Tauri `overlay-data` events the real pipeline would, at precise millisecond offsets. The UI has zero knowledge it's in demo mode. Every alert, topic change, speaker update, and commitment fires with frame-perfect timing on every take.

**How it works:**
- The script calls `emitTo("meeting-overlay", "overlay-data", { type, payload })` — the exact same call the meeting page uses in production
- VAD events (`vad-speech-start` / `vad-speech-end`) control the voice gradient breathing
- A countdown overlay (visible only to the operator, not in the recording) shows upcoming cues
- Hit one key → the timeline starts → every take is identical

**What gets scripted (in order):**
1. Participant list loads (Priya/TEAM, Alex/TEAM)
2. Topic fires: `"Commercial Terms"`
3. Constraint counter increments to 4
4. Speaker updates: `"Sarah · EXTERNAL"` speaking
5. Scope creep alert fires with suggestion + evidence
6. VAD pulse: gradient breathes (simulates Priya responding)
7. Client backtrack alert fires — contradiction from 0:09
8. Commitment ledger: 4 entries, last one `CONTRADICTED`
9. "Remember this" ripple triggers

**The benefit:** You can record 20 takes of the same 30-second overlay sequence with zero variance. Pick the cleanest one.

> 🔧 Implementation note: The demo runner will live at `apps/desktop/src/features/demo/demo-runner.ts` with a typed `DemoEvent[]` timeline. Wired behind a `?demo=true` URL param on the meeting route — zero production impact.

### Option B — Hybrid (Higher Production Value)
Add a single shot of hands on a keyboard, or a face looking at the overlay — 2 seconds max. Grounds it in reality. Then pure screen for the rest.

### Option C — Pure Motion Design (If UI isn't polished yet)
Animate the UI in Figma/After Effects using the exact spec from `meet-ui.md`. This gives you complete control and a more cinematic result. Cluely's early demo videos were heavily motion-designed.

---

## Music & Sound Design

| Moment | Sound |
|---|---|
| Act I (0:00–0:08) | Near-silence. Very low ambient drone. Tension. |
| Act II entry (0:08) | Music fades in — ambient electronic, 80 BPM |
| Alert entry (0:14, 0:24) | Subtle UI chime — acknowledgment, not alarm |
| Architecture segment (0:38) | Music drops to near-silence or -18db. Voiceover only. |
| Act III entry (0:56) | Music lifts slightly — resolution energy |
| Act IV (1:14–1:18) | Music fades to near-silence. Last note sustains. |

**Music reference tracks:**
- Ólafur Arnalds — "Near Light"
- Floating Points — "Anasickmodular"
- Jon Hopkins — "Abandon Window"
- Nils Frahm — "Says"

*(License-free alternatives: Artlist search "ambient minimal electronic")*

---

## On-Screen Text Rules

> Never more than 6 words at once. Never explain what the user can see.
> White, `font: 500 13px/1.4 "Geist", monospace`, bottom-left or bottom-center only.

| ✅ Do | ❌ Don't |
|---|---|
| `42 minutes apart.` | `Larity detected a contradiction between two client statements` |
| `In real time.` | `Real-time contradiction detection powered by AI` |
| `It still knows.` | `Our organizational memory persists across all meetings` |
| `Work, with memory.` | `The future of meeting intelligence` |

---

## Distribution Format

| Platform | Spec |
|---|---|
| Twitter / X | 1920×1080, MP4, no letterbox, 60fps |
| LinkedIn | Same — autoplay muted, so Act I text must work without audio |
| YC demo / pitch | 1920×1080 embedded or Loom link |
| Product website | Loop the overlay section (0:12–0:38) as a 26s hero video |

> **Critical:** Add burned-in captions for LinkedIn (muted autoplay). Style them to match the UI — monospace, white, bottom-aligned. They become a design element, not an afterthought.

---

## Decision Points to Resolve Before Production

> [!IMPORTANT]
> Answer these before you start recording anything.

1. **Is the Larity overlay UI polished enough to record live?** If not, mock it in Figma and animate in After Effects — same narrative, higher control.

2. **Demo call setup:** Will you script a fake meeting (you + a confederate)? Or build an OBS scene that simulates a meeting + overlay? The fake meeting feels more real, but requires a second person.

3. **Accent / language:** The call in the demo — English only, or show the Hinglish/multilingual capability? (Recommend: English for widest appeal, one word of Hindi max as a texture moment.)

4. **Company name reveal timing:** Should the wordmark appear at 0:08 (as planned), or open cold with the product and save the name for the close? The cold-open variant is riskier but more cinematic.

5. **CTA:** Waitlist link? Direct contact? Keep it off entirely for the YC version?

---

## The Single Most Important Thing

The Cluely demo works because it shows something that *shouldn't be possible* — an AI whispering answers into an interview in real time. You watch it and think: "that's not allowed."

Larity's version of that moment is **Shot 5** — the budget contradiction alert. The moment Larity surfaces that the client revised their budget by $15k from 42 minutes ago, **live, during the call, before anyone else noticed** — that's the "shouldn't be possible" beat.

The architecture segment is what makes a technical founder pause and rewind. The three decisions — OS-level audio, VAD correlation, 4-tier pipeline — are the signal that this was built by someone who understands the real problem, not just the surface one.

**Make Shot 5 and the architecture segment perfect before anything else.**
