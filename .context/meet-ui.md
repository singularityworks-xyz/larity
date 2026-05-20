# Larity Meeting Mode UI — Full Spec

> Consolidated spec covering design philosophy, overlay, alerts, panel header, transcript, and sidebar.

---

## Document Contents

| Section | Covers |
|---|---|
| §1 — Overview | Design philosophy, AI Gradient System, typography, color tokens, motion system, surface rules, file structure, functionality enhancements |
| §2 — Overlay | Floating overlay window: `OverlayShell`, `VoiceGradient` canvas, `AmbientStrip`, alert region container, "Remember this" ripple, footer pill controls |
| §3 — Alerts | `AlertCard` component: severity tiers, category chips, entry/exit animations, suggestion surfacing, history view, queue functional enhancements |
| §4 — Panel Header | `MeetingHeader`, `AmbientStatusBar`, `TopicsTimeline` (proportional rail) |
| §5 — Transcript | `TranscriptStream`, `SpeakerChip`, utterance rows, live tail (partial/pending), mode tabs, scroll anchoring |
| §6 — Sidebar | `MeetingSidebar`: participant list, commitment ledger, notes scratchpad, speaker quick-identify |

---

## §1 — Overview

### Aesthetic Direction

**Codename: "Precision Intelligence"**

The reference aesthetic is **Vercel + CommandCode** — a tool built for professionals who demand clarity. Every surface is flat, opaque, and purposeful. The single expressive element is the **bottom-anchored voice gradient** on the overlay window, which behaves exactly like the Gemini Voice Chat orb: quiet at rest, rising and brightening when the user speaks. Outside of that gradient, there is no decorative color, no transparency, no blur.

This is a product that respects the user's attention. It does not try to look like AI — it lets AI behavior speak for itself.

### Core Principles (Revised)

1. **Intelligence is visible, not decorative.** The AI presence shows through behaviour — a gradient that breathes at the bottom of the overlay, an alert that slides in with purpose, a live cursor in the transcript. Not every surface needs to announce it is AI.
2. **Flat surfaces, full opacity.** All panels, cards, and containers are opaque flat colours. No `backdrop-filter` inside components, no `rgba` layering on surfaces, no noise textures. The overlay window's shell may use one single calibrated translucent layer (per original spec) — everything inside it renders flat.
3. **Chromatic restraint, chromatic precision.** The monochromatic base is preserved. Color enters through exactly two channels: (a) the bottom-anchored voice gradient (HSL-shifted by context) and (b) semantic state tokens. No decorative hues.
4. **Motion is intelligence.** Transitions communicate meaning — alerts enter with a subtle spring, topic labels slide directionally, the gradient breathes. Nothing animates without a reason.
5. **Density is non-negotiable.** The overlay is 360px wide. The panel runs beside an active call. Information is dense but never cluttered. Hierarchy: **glanceable → readable → explorable**.

---

### The AI Gradient System

The single expressive element in an otherwise flat UI. A canvas-rendered radial bloom pinned to the **bottom of the overlay window** — identical in concept and position to the Gemini Voice Chat orb. At rest it glows softly. When the user speaks, it rises, brightens, and expands. When silent, it recedes.

#### Positioning Principle

The gradient canvas is `position: absolute; bottom: 0; left: 0; right: 0; height: 200px` — anchored to the overlay's bottom edge. A CSS `mask-image` creates a clean fade-to-transparent at the top so it never bleeds into content above. All UI content (title bar, ambient strip, alerts, footer) sits above on `z-index: 1`.

```text
┌─────────────────────────────────┐
│ [title bar]               z:1   │
│ [ambient strip]           z:1   │
│ [alert region]            z:1   │
│ [footer]                  z:1   │
│ ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  │ ← mask fades gradient out here
│    ░░░░░░░░░░░░░░░░░           │
│  ░░░░░░░░░░░░░░░░░░░░░░        │ ← gradient blooms upward on speech
│ ░░░░░░░░░░░░░░░░░░░░░░░░░      │
└─────────────────────────────────┘  z:0 — gradient canvas
```

#### Canvas Rendering (rAF loop)

```ts
// Two radial blooms — primary (bottom-centre) + secondary (bottom-left offset)
// Both have their origin below the canvas bottom edge so they appear to
// "emerge from the floor" rather than being centred in view.

function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, s: GradState) {
  ctx.clearRect(0, 0, W, H);

  // Primary bloom — centre drifts very slowly on a sine wave (±8% of width)
  const cx1 = W * (0.5 + Math.sin(s.t * 0.05) * 0.08);
  const cy1 = H + W * 0.08;                       // origin below canvas
  const r1  = W * (0.55 + s.amp * 0.65);          // expands upward when speaking

  const L1  = 36 + s.amp * 22;                    // luminance: 36% idle → 58% peak
  const op1 = 0.42 + s.amp * 0.38;                // opacity: 0.42 → 0.80

  const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, r1);
  g1.addColorStop(0,    `hsla(${s.hue}, 76%, ${L1}%, ${op1})`);
  g1.addColorStop(0.50, `hsla(220, 65%, ${L1 * 0.68}%, ${op1 * 0.45})`);
  g1.addColorStop(1,    "transparent");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  // Secondary bloom — offset, 55% radius, provides depth
  const cx2 = W * 0.22;
  const cy2 = H + W * 0.05;
  const r2  = r1 * 0.55;
  const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r2);
  g2.addColorStop(0,   `hsla(280, 62%, ${L1 * 0.78}%, ${op1 * 0.52})`);
  g2.addColorStop(1,   "transparent");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
}
```

**Per-frame state smoothing:**
```ts
s.amp  += (targetAmp  - s.amp)  * 0.12;   // smooth VAD amplitude
s.hue  += (targetHue  - s.hue)  * 0.03;   // very slow hue shift (~3s to settle)
s.t    += dt;                               // monotonic time for drift
```

#### CSS Mask (top fade)

```css
.voice-gradient-canvas {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 200px;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: linear-gradient(to top, black 0%, black 35%, transparent 100%);
  mask-image:         linear-gradient(to top, black 0%, black 35%, transparent 100%);
}
```

#### Hue Context Rules

| State | Target hue | Transition speed |
|---|---|---|
| Idle / listening | `252` (violet) | n/a — default |
| User speaking (mic active) | `200` (blue-teal) | slow (`lerp 0.03`) |
| Critical alert active | `5` (red-violet) | slow (`lerp 0.03`) |
| High severity alert active | `28` (amber-red) | slow (`lerp 0.03`) |

Hue shifts are deliberately slow (3–5 seconds to complete). Colour never snaps.

#### Where It Appears

| Surface | Gradient present? |
|---|---|
| **Overlay bottom zone** | ✅ Bottom-anchored canvas, rises with amplitude |
| Panel header | ❌ Flat. The live indicator dot alone inherits `--grad-hue` for its colour. |
| Transcript stream | ❌ Flat. |
| Alert cards | ❌ Flat. Severity uses token-based wash, not gradient. |
| Sidebar | ❌ Flat. |
| Any other surface | ❌ Never. |

---

### Typography Overhaul

The current spec uses Geist. We upgrade to a more characterful pairing:

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display / Meeting title | **"Söhne"** (or fallback: `"DM Sans"`) | 500 | Warm grotesque, humanist feel |
| UI body & labels | **"Geist"** | 400–500 | Retained for density |
| Monospace (transcripts, timestamps, IDs) | **"Geist Mono"** | 400 | Retained |
| Numeric data (counters, timers) | Geist with `font-feature-settings: "tnum" 1` | 600 | Tabular-optimized |

**New scale additions for meeting mode:**

| Token | Size | Weight | Use |
|---|---|---|---|
| `text-micro` | 9px / 12px | 600 | Pill badges, routing labels |
| `text-display` | 18px / 24px | 500 | Meeting title in panel header |

---

### Revised Color Tokens

Only two new tokens are added. Everything else in the system is unchanged.

```css
:root {
  /* AI Gradient System — drives the overlay bottom orb only */
  --grad-hue: 252;   /* updated by JS per context */

  /* Overlay window — unchanged from original spec */
  --surface-overlay: #0E0E0EE6;  /* 90% opaque black */
}
```

**Explicitly not added:** `--glass-bg`, `--glass-border`, `--glass-blur`, `--glass-inner`, `--noise-opacity`. Those do not exist.

---

### Motion System

The current spec mandates `≤200ms`, opacity + translateY only, no springs. We **extend** this for meeting mode only:

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | All UI transitions |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | **Alert entry only** — micro-overshoot signals urgency |
| `--duration-fast` | `100ms` | Hover states, colour changes |
| `--duration-base` | `150ms` | Dropdowns, expand/collapse |
| `--duration-slow` | `250ms` | Alert entry, topic shift |

**New `@keyframes` (meeting-mode.css):**

```css
/* Alert enters from right */
@keyframes alert-enter {
  from { opacity: 0; transform: translateX(10px) scale(0.98); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}

/* Alert exits left on dismiss */
@keyframes alert-exit {
  from { opacity: 1; transform: translateX(0); max-height: 200px; }
  to   { opacity: 0; transform: translateX(-8px); max-height: 0; padding: 0; }
}

/* Topic label slides in from right on topic shift */
@keyframes topic-enter {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Counter flash on new entry */
@keyframes counter-flash {
  0%, 100% { background: transparent; }
  30%       { background: var(--accent-subtle); }
}

/* Live indicator ring — pulse around the title-bar dot */
@keyframes speak-ring {
  0%   { transform: scale(1);   opacity: 0.5; }
  70%  { transform: scale(1.9); opacity: 0; }
  100% { transform: scale(1.9); opacity: 0; }
}

/* Remember this ripple — from footer button origin */
@keyframes remember-ripple {
  from { transform: scale(0); opacity: 0.14; }
  to   { transform: scale(20); opacity: 0; }
}
```

---

### Surface Rules (No Glass)

All components are **flat and opaque**. This is enforced, not optional.

| Token | Hex | Used for |
|---|---|---|
| `--bg` | `#000000` | App background, overlay interior |
| `--bg-elevated` | `#0A0A0A` | Sidebar, tab bars, section headers |
| `--bg-subtle` | `#111111` | Hover states, inset rows |
| `--bg-emphasis` | `#171717` | Active rows, selected states |
| `--surface-overlay` | `#0E0E0EE6` | Overlay **window shell** — the one translucent layer in the system |

**The one exception:** The overlay Tauri window renders with `--surface-overlay` (90% opaque). This is a window-level transparency, not a CSS `backdrop-filter`. Inside the overlay, every component uses solid `#000` or `#0A0A0A`. No component applies `backdrop-filter`, `rgba()` backgrounds, or layered transparency.

---

### File Structure for Redesign

Changes are scoped to:

```text
apps/desktop/src/
  features/
    overlay/
      overlay-shell.tsx         ← gradient canvas wrapper + glass base
      overlay-shell.css         ← @keyframes, CSS var animations
      ambient-strip.tsx         ← voice gradient integration
      voice-gradient.tsx        ← NEW: the AI orb / gradient canvas component
      alert-region.tsx          ← staggered list with enter/exit animations
      overlay-footer.tsx        ← pill-redesigned controls
    alerts/
      alert-card.tsx            ← full visual overhaul
    meeting-live/
      meeting-header.tsx        ← gradient atmospheric wash
      topics-timeline.tsx       ← animated segment rail
      transcript-stream.tsx     ← live partial gradient row
      meeting-sidebar.tsx       ← glass panel sidebar
  styles/
    meeting-mode.css            ← new file: all meeting-mode-specific tokens + @keyframes
```

---

### Functionality Enhancements (Cross-Cutting)

| Feature | Current | Redesigned |
|---|---|---|
| Voice reactivity | Binary (speaking/silent dot) | Continuous amplitude gradient + pulse ring |
| Alert entry | Instant fade-in | Spring slide from right with stagger |
| Topic shifts | Instant label swap | Directional slide (new topic from right, old fades left) |
| "Remember this" | Text flash banner | Ripple from button → subtle overlay wash for 1.5s |
| Alert mute state | Text label "Alerts muted" | Gradient desaturates to grayscale, bell icon with slash animation |
| Pending alerts | Not surfaced | Subtle badge on footer: `+N queued` |
| Commitment flash | Not present | Commitment counter flashes with a `success` hue burst on new entry |

---

### Summary of Changes vs. Current Implementation

#### What's Staying

- Monochromatic dark-only theme (no new arbitrary hues)
- Token naming convention (`--fg`, `--bg-elevated`, `--accent`, semantic states)
- Geist / Geist Mono typefaces
- Dense compact layout as the default
- Alert queue capacity (max 2 visible), priority ranking, debounce logic
- Tauri event bus (`overlay-data`) for overlay ↔ main window sync
- All existing data models (`MeetingAlert`, `LiveUtterance`, `LiveCommitment`, `LiveParticipant`)

#### What's New

| Change | Impact |
|---|---|
| **AI Gradient System** (`VoiceGradient` canvas) | Overlay feels alive; VAD amplitude drives visual breathing |
| **Gradient hue context-shifting** | Hue moves from violet → teal (speaking) → red (critical alert) across both overlay and panel header dot |
| **Overlay shell** | 90% opaque flat background (`--surface-overlay: #0E0E0EE6`) — no backdrop-filter, no noise texture, no glass |
| **Alert suggestion always visible** | Reduces clicks to understand the alert's actionable guidance |
| **Alert entry spring animation** | Signals urgency without being jarring |
| **Alert exit animation** (coordinated dismiss) | Alerts slide out gracefully; queue promotion is smooth |
| **Proportional topics timeline** | Segment widths reflect actual duration — a real timeline, not tab bar |
| **Remember this → ripple** | Full-overlay ripple replaces text banner |
| **Pending alert badge** in footer | `+N queued` indicator — users know more is coming |
| **Commitment attribution** (sidebar) | Speaker name shown on each commitment entry |
| **Contradiction linking** (sidebar) | Contradicted commitments link to the contradicting utterance |
| **Speaker quick-identify** (sidebar) | Inline name assignment for unidentified speakers |
| **Notes as mono / collapsed** | Textarea uses monospace; section is collapsed by default |
| **DM Sans display font** for meeting title | More characterful than Geist at 15px for the title |
| **Uppercase section labels** (sidebar) | Instrument-panel density feel |
| **`prefers-reduced-motion` full support** | Gradient, animations, and transitions all respect the media query |

#### Implementation Priority Order

1. Alert card visual overhaul
2. Alert entry/exit animations
3. Suggestion surfaced by default
4. Overlay glass surface
5. `VoiceGradient` canvas component
6. Gradient hue CSS variable
7. Proportional topics timeline
8. Remember this → ripple
9. Sidebar refinements
10. Transcript mode tabs → underline tabs
11. Ambient status bar counter badges

---

## §2 — Overlay

> Component spec for the 360px floating overlay window.

The overlay is the primary meeting-mode surface for most users — it lives on top of Zoom/Teams at all times. It must be **glanceable in under 150ms**, visually distinct from any other desktop application, and feel like genuine intelligence rather than a status widget.

### Structural Anatomy (Revised)

```text
┌─────────────────────────────────────┐  ← 360px wide, auto-height
│  [AI Gradient Canvas — z-0]         │
│  [Glass base layer — z-1]           │
│  ┌─────────────────────────────────┐│
│  │ TITLE BAR        [client · 05:12]││  28px, drag region
│  ├─────────────────────────────────┤│
│  │ VOICE GRADIENT ZONE             ││  auto (64px min)
│  │  ┌── Ambient Strip ────────────┐││
│  │  │ ◉ Topic label   [C:3] [TM] ││
│  │  │ Speaking: Alex (EXTERNAL)  ││
│  │  └────────────────────────────┘││
│  ├─────────────────────────────────┤│
│  │ ALERT REGION                    ││  auto-height
│  │  ╔═══════════════════════════╗  ││
│  │  ║ Alert Card 1              ║  ││
│  │  ╚═══════════════════════════╝  ││
│  │  ╔═══════════════════════════╗  ││
│  │  ║ Alert Card 2              ║  ││
│  │  ╚═══════════════════════════╝  ││
│  ├─────────────────────────────────┤│
│  │ [Remember flash — conditional]  ││  24px, only when active
│  ├─────────────────────────────────┤│
│  │ FOOTER                          ││  36px
│  │ [End][🔔][⤢]        [+2 queued][★]│
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### `OverlayShell` — The Container

#### Background Architecture

The shell is **flat, opaque, and simple**. Two elements — the window surface and the gradient canvas at the bottom:

```text
┌───────────────────────────────────────┐
│  bg: --surface-overlay (#0E0E0EE6)    │  ← window shell (90% opaque)
│  border: 1px solid rgba(255,255,255,  │
│          0.06), radius: 12px          │
│                                       │
│  [content — z-index: 1]               │
│  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·   │  ← gradient mask top edge
│        ░░░░░░░░░░░░░░░░               │
│      ░░░░░░░░░░░░░░░░░░░░░            │  ← gradient rises with speech
│    ░░░░░░░░░░░░░░░░░░░░░░░░░          │
│  [gradient canvas — z-index: 0]       │
└───────────────────────────────────────┘
```

No backdrop-filter. No noise texture. No inner highlight pseudo-element. The depth comes from the window border and the gradient alone.

#### Shell JSX

```tsx
export function OverlayShell() {
  return (
    <div
      className={cx(
        "relative flex h-screen w-screen select-none flex-col overflow-hidden",
        "rounded-[12px]",
        "border border-white/[0.06]",
        "bg-[#0E0E0EE6]",      // --surface-overlay — flat, no blur
      )}
      data-tauri-drag-region
    >
      <VoiceGradient
        hasActiveAlert={visibleAlerts.length > 0}
        alertSeverity={visibleAlerts[0]?.severity ?? null}
        isSpeaking={data.isMicActive}
      />
      <div className="relative z-[1] flex flex-1 flex-col overflow-hidden">
        {/* title bar, ambient strip, alert region, remember flash, footer */}
      </div>
    </div>
  );
}
```

### Title Bar

**Current:** `client · title · timer` flat row, 10px text, white/4% border-b.

**Redesigned:**
- Height: `28px`
- Background: `rgba(0,0,0,0.2)`
- Border-bottom: `1px solid rgba(255,255,255,0.05)`
- `client`: `9px / 500 / fg-subtle`
- `·`: `fg-subtle/40` separator
- `title`: `10px / 500 / fg-muted`
- `timer`: right-aligned, `font-mono / 10px / fg-subtle / tabular-nums`
- Drag affordance cursor: `grab` / `grabbing`

**Change:** The heartbeat dot now inherits `--grad-hue` so it shifts with context.

### Voice Gradient Zone + Ambient Strip

#### `VoiceGradient` Canvas Component

New file: `voice-gradient.tsx`. The canvas is `position: absolute; bottom: 0`, 200px tall, masked to fade at the top. See §1 for the full render loop and hue rules.

#### Ambient Strip (Revised)

The strip renders on top of the gradient canvas. It loses its border-bottom.

**New layout:**
```text
Row 1: [◉ pulse] [topic label (flex-1, animated)] [constraint badge] [teammate avatars]
Row 2: [voice matrix OR speaker pill] [mic state label]
```

**AnimatedTopicLabel** — wraps topic text, on change old fades left, new enters from right.

**Constraint badge** — flash `bg-accent-subtle` for 300ms on increment.

**Teammate avatars:**
- 18px square, `border-radius: 4px`
- Stack with `-space-x-1` overlap
- Border: `1.5px solid #0E0E0E`
- Background: `--bg-subtle`

**Voice Matrix redesign:**
- Active dots shift colour to `hsl(var(--grad-hue), 80%, 70%)`
- When speaking: ripple from centre: `delay = distanceFromCenter * 150ms`
- Dot radius: `r=1.8`

**Speaker Pill:**
```text
[dot 5px, rounded-[1px], hsl(--grad-hue) fill] [Name 11px/500/fg] [TEAM|EXTERNAL badge]
```

**Bottom separator — gradient mask instead of border.**

### Alert Region

See §3 for full alert card spec.

#### Container
```tsx
<div aria-label="Active alerts" aria-live="polite" className="flex flex-col gap-2 px-3 py-2.5" role="region">
  {visibleAlerts.map((alert, i) => (
    <AlertCard
      alert={alert}
      expandedId={expandedAlertId}
      key={alert.id}
      onDismiss={() => onDismiss(alert.id)}
      onToggleExpand={...}
      style={{ animationDelay: `${i * 40}ms` }}
    />
  ))}
</div>
```

#### Empty / Muted States

**Empty:**
```tsx
<div className="flex min-h-[52px] items-center justify-center px-3 py-3">
  <span className="font-medium text-[10px] text-fg-subtle/40">No active alerts</span>
</div>
```

**Muted:**
```tsx
<div className="flex min-h-[52px] items-center gap-2 px-3 py-3">
  <BellOff className="h-3 w-3 text-fg-subtle/40" strokeWidth={1.5} />
  <span className="font-medium text-[10px] text-fg-subtle/40">Alerts muted</span>
</div>
```

### "Remember This" Flash

The flash is a **radial ripple** that originates from the Remember button position and washes across the entire overlay body.

```tsx
function RememberRipple({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-2 right-3 h-8 w-8 rounded-full bg-accent-subtle"
      style={{
        animation: "remember-ripple 1.4s cubic-bezier(0.2, 0, 0, 1) forwards",
        zIndex: 2,
      }}
    />
  );
}
```

### Footer (Redesigned)

#### Layout
```text
[ End ] [ 🔔 ] [ ⤢ ]     ——flex-1 spacer——    [+2 queued]  [ ★ ]
```

#### Button pill style
```css
.footer-btn {
  height: 26px; padding: 0 10px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.04);
  font-size: 10px; font-weight: 500; color: var(--fg-muted);
  display: inline-flex; align-items: center; gap: 5px;
  cursor: pointer; -webkit-app-region: no-drag;
}
.footer-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.10); color: var(--fg); }
```

#### "End" button — danger variant
```css
.footer-btn-end { color: var(--danger-fg); border-color: rgba(248, 81, 73, 0.15); background: rgba(248, 81, 73, 0.08); }
```

#### Pending alerts badge — NEW
```tsx
<span className="inline-flex h-[18px] items-center gap-1 rounded-[3px] border border-warning-fg/20 bg-warning-bg px-1.5 font-mono text-[9px] text-warning-fg">
  +{pendingCount} queued
</span>
```

### Overlay Window Config (Tauri)

```json
{ "decorations": false, "transparent": true, "alwaysOnTop": true, "shadow": false, "width": 360, "minHeight": 160, "resizable": false, "skipTaskbar": true }
```

On Linux: fall back gracefully if no compositor — `transparent: false`, `--surface-overlay` resolves to `#0E0E0E`.

### Accessibility Notes

- Gradient canvas has `aria-hidden="true"`
- All audio state communicated by gradient hue is also communicated by VoiceDotMatrix accessible label and SpeakerIndicator text
- Alert region has `role="region"` and `aria-live="polite"`
- `prefers-reduced-motion`: gradient disabled, all `@keyframes` collapse to `1ms`

---

## §3 — Alerts

> Component-level spec for the alert card, alert region, and queue UX.

The alert system is Larity's primary value surface. The redesign treats it like a **briefing from an intelligence officer** — precise, urgent, contextual, and actionable.

### Design Philosophy

Every alert must communicate **four things instantly**:
1. **How urgent?** — left rail severity color + intensity
2. **What happened?** — one-line message in high-contrast body text
3. **Who triggered it?** — speaker attribution always visible
4. **What should I do?** — Suggestion is surfaced immediately, not hidden behind "More"

### Alert Card — Visual Anatomy (Revised)

```text
╔══════════════════════════════════════════╗  ← rounded-[6px] border
║ ▌                                        ║  ← 2.5px left rail
║ ▌  [Category chip]       [time] [✕]     ║
║ ▌  Message text in fg, 12px/500          ║
║ ▌  💡 Suggestion text in fg-muted 11px  ║  ← always visible
║ ▌  [Alex (EXTERNAL)]     [Evidence ▾]  ║
╚══════════════════════════════════════════╝
```

- **Width:** fills container
- **Border radius:** `6px`
- **Left rail:** `2.5px` wide
- **Padding:** `10px 12px 10px 14px`

### Alert Severity Visual System

**critical:**
```css
background: linear-gradient(135deg, rgba(248,81,73,0.10) 0%, rgba(248,81,73,0.04) 50%, transparent 100%);
border: 1px solid rgba(248,81,73,0.20);
border-left: 2.5px solid var(--danger-fg);
```

**high:**
```css
background: rgba(210,153,34,0.07);
border: 1px solid rgba(210,153,34,0.15);
border-left: 2.5px solid var(--warning-fg);
```

**medium:**
```css
background: rgba(255,255,255,0.03);
border: 1px solid rgba(255,255,255,0.08);
border-left: 2.5px solid var(--fg-subtle);
```

**low:**
```css
background: transparent;
border: 1px solid rgba(255,255,255,0.06);
border-left: 2.5px solid rgba(255,255,255,0.15);
```

**Routing treatment:** Shared → rail uses `--accent` (violet). Personal → severity color.

### Alert Category Chips

| Category | Chip style |
|---|---|
| `policy_violation` | `bg-danger-bg text-danger-fg` |
| `information_risk` | `bg-danger-bg/60 text-danger-fg` |
| `self_contradiction` | `bg-warning-bg text-warning-fg` |
| `team_inconsistency` | `bg-warning-bg text-warning-fg` |
| `risky_commitment` | `bg-warning-bg/70 text-warning-fg` |
| `pressure_detected` | `bg-danger-bg/50 text-danger-fg/80` |
| `client_backtrack` | `bg-accent-subtle text-accent` |
| `scope_creep` | `bg-info-bg text-info-fg` |
| `tone_warning` | `bg-[rgba(210,153,34,0.08)] text-warning-fg` |
| `client_disengagement` | `bg-bg-subtle text-fg-muted` |
| `missing_clarity` | `bg-bg-subtle text-fg-muted` |
| `undiscussed_agenda` | `bg-info-bg/60 text-info-fg` |

### Entry / Exit Animations

**Entry:** Spring easing `cubic-bezier(0.34, 1.56, 0.64, 1)` — micro-overshoot, 280ms.
**Exit:** Ease-out, 200ms.
**Staggered entry delay:** `index * 50ms`.

### History View (Main Panel)

- **No dismiss button**
- **No entry animation**
- **Suggestion:** still always visible
- **Evidence expansion:** still available
- Shows `confidence` indicator at bottom

### `useAlertQueue` — Functional Enhancement

**Pending count exposure:**
```ts
pendingCount = visibleAlerts.length < maxVisible ? 0 : queue.filter(a => !visibleAlerts.includes(a)).length;
```

**Exit animation coordination:**
```ts
// Add to exitingIds set, after 220ms actually remove
```

### Alert Sound Design (Future)

```ts
if (alert.severity === "critical" && !alertsMuted) {
  window.dispatchEvent(new CustomEvent("larity:alert-sound", { detail: { severity: alert.severity } }));
}
```

### Muted State

Gradient canvas desaturates: `filter: saturate(0) brightness(0.6)`.

### Accessibility

- New alerts have `role="alert"`, region has `role="region"` and `aria-live="polite"`
- Evidence toggle uses `aria-expanded`
- `prefers-reduced-motion`: animations disabled

---

## §4 — Panel Header

> Covers: `MeetingHeader`, `AmbientStatusBar`, `TopicsTimeline`.

### `MeetingHeader` — Full Redesign

**Current:** 56px sticky bar with flat `bg-bg`.
**Redesigned:** 52px header with shallow atmospheric gradient wash.

#### Layout
```text
┌────────────────────────────────────────────────────────────────┐  52px
│  ◉  [ClientName]  ·  [Meeting Title]          00:42:17  [Actions]│
└────────────────────────────────────────────────────────────────┘
```

#### Background
```css
.meeting-header {
  position: sticky; top: 0; z-index: 20; height: 52px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
```

#### Heartbeat Indicator (Redesigned)

```tsx
function LiveIndicator({ isActive }: { isActive: boolean }) {
  return (
    <span className="relative inline-flex h-[7px] w-[7px] shrink-0">
      {isActive && (
        <span aria-hidden className="absolute inset-0 animate-[speak-ring_2.2s_ease-out_infinite] rounded-full"
          style={{ background: "hsl(var(--grad-hue,252) 70% 55% / 0.45)" }} />
      )}
      <span className="relative h-[7px] w-[7px] rounded-full transition-colors duration-500"
        style={{ background: isActive ? "hsl(var(--grad-hue,252) 70% 60%)" : "var(--fg-subtle)" }} />
    </span>
  );
}
```

#### Timer
```tsx
<time className="shrink-0 font-mono text-[12px] text-fg-muted tabular-nums relative z-[1]">
  {formatElapsed(elapsedMs)}
</time>
```

#### Action Buttons
- Ghost icon buttons: `h-7 w-7 rounded-[5px]`
- Hover: `bg-white/[0.05]` with `border border-white/[0.06]`
- **End/Leave button**: danger variant

### `AmbientStatusBar` — Redesign

**Current:** 40px bar with backdrop blur.
**Redesigned:** 44px semantic intelligence rail.

#### Layout
```text
◉  |  [Topic chip — animated]  |  [Constraint badge]  [Commitment badges]  |  [Participant row]
```

#### Background
```css
background: linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 100%);
```

#### Topic Chip
```tsx
function TopicChip({ topic }: { topic: string | null }) {
  // Animated with topic-enter keyframe on change
  // Shows "Listening…" when null
}
```

#### Counter Badges

**Constraint:** `border-warning-fg/25 bg-warning-bg text-warning-fg`
**Commitment:** `border-success-fg/20 bg-success-bg text-success-fg`
**Contradiction:** `border-danger-fg/25 bg-danger-bg text-danger-fg`

All flash via `counter-flash` on increment (400ms).

### `TopicsTimeline` — Redesign

**Current:** Horizontal scrollable strip of flat buttons with active underline.
**Redesigned:** Proportional timeline rail — segment widths reflect actual duration.

#### Proportional Width Calculation
```tsx
const totalElapsed = Date.now() - meetingStartedAtMs;
const segments = topics.map((topic, i) => {
  const start = topic.startedAt - meetingStartedAtMs;
  const end = i < topics.length - 1 ? topics[i + 1].startedAt - meetingStartedAtMs : totalElapsed;
  const duration = Math.max(0, end - start);
  const proportion = totalElapsed > 0 ? duration / totalElapsed : 1 / topics.length;
  return { ...topic, proportion, durationMs: duration };
});
```

Each segment's `flex-grow` is set to its proportion value. Active topic gets a 2px bottom accent line.

#### Empty state
```tsx
<div className="flex h-10 items-center border-border border-b bg-bg-elevated px-4">
  <span className="font-medium text-[10px] text-fg-subtle/50">Topic segments will appear as the conversation shifts…</span>
</div>
```

### Layout Integration

```text
<header class="meeting-header">   52px, sticky z-20
<output class="ambient-status-bar">  44px, sticky z-19
<div class="topics-timeline">   40px, sticky z-18
<main class="content-area">   flex-1, overflow-hidden
```

---

## §5 — Transcript

> Covers: `TranscriptStream`, `SpeakerChip`, live partial rendering, mode tabs, alert history.

### Core Philosophy

The transcript is the most information-dense surface in Larity. It must achieve:
- **Scannable at speed**
- **Temporally grounded**
- **Live feedback**
- **State-annotated**

### Mode Tabs (Redesigned)

**Current:** Segment control.
**Redesigned:** Underline tabs.

```tsx
<nav aria-label="Transcript view mode">
  {(["full", "commitments", "alerts"] as const).map((m) => (
    <button aria-selected={mode === m} role="tab">
      {m === "full" && "Transcript"}
      {m === "commitments" && "Commitments"}
      {m === "alerts" && <>Alerts {count}</>}
    </button>
  ))}
  {!pinnedToBottom && <span>Scrolled up</span>}
</nav>
```

### Speaker Chip — Redesign

| Speaker type | Background | Text | Dot color |
|---|---|---|---|
| `team_self` | `--accent-subtle` | `--accent` | `--accent` |
| `team` | `bg-white/[0.06]` | `--fg` | Confidence-based |
| `external` | transparent | `--fg-muted` | Confidence-based |
| Unidentified | transparent dashed | `--fg-subtle` | `--fg-subtle` |

Height: 18px, dot: 5×5 square with `border-radius: 1px`.

### Utterance Row — Redesign

```
[gutter 6px] [chip] [timestamp] ... [text body]
```

Grid layout: `grid-cols-[auto_1fr]`.

Left gutter supports 3 states: memory (accent), alert (warning), commitment (success).

### Live Tail — Partial & Pending

**Live Partial:** Streaming text with `▍` cursor inheriting `--grad-hue`.
**Pending Final:** Label changes from "Live · Mic" to "Processing · Mic", `opacity-60`.

### Scroll Anchor Behavior

**Jump to Now button:** Uses `backdrop-blur-sm`, floats over transcript.
**Scroll target highlight:** Accent outline ring that fades over 1.4s.

### Alert History Mode

Renders `alertHistory` using `AlertCard` with `isHistoryView={true}`, sorted most recent first.

Section header: sticky, shows `Alert history · {count} total`.

### Commitments Mode

Groups utterances by speaker with sticky divider labels:
```tsx
<div className="sticky top-0 flex items-center gap-2 border-border-subtle border-b bg-bg px-5 py-1.5">
  <SpeakerChip name={speaker} />
  <span className="font-mono text-[10px] text-fg-subtle">{rows.length} commitment(s)</span>
</div>
```

### Empty States

One icon, one line — no buttons or illustrations.

---

## §6 — Sidebar

> Covers: `MeetingSidebar`, participant list, commitment ledger, notes scratchpad.

### Philosophy

Three sections with different interaction frequencies:
- **Participants** — glanced periodically
- **Commitment Ledger** — referenced during meeting
- **Notes Scratchpad** — actively typed into

### Sidebar Container

300px wide, `bg-[linear-gradient(180deg,var(--bg-elevated)_0%,var(--bg)_100%)]`, left border.

### Section Architecture — `CollapsibleSection`

```tsx
function CollapsibleSection({ title, badge, children, defaultOpen = true }) {
  // Chevron toggle, uppercase label, count badge
}
```

Section labels: `10px uppercase tracking-[0.07em]`.

### Participant List — Redesign

**Avatar:** 24px square, `rounded-[4px]`.
**Name:** `12px / 500 / fg`.
**Sub-row:** type `9px uppercase` + confidence + connection dot (5×5 square).

**Team / External sub-sections** with divider and count.

### Commitment Ledger — Redesign

**Status badges:**
- CONFIRMED: `border-success-fg/25 bg-success-bg text-success-fg`
- TENTATIVE: `border-warning-fg/25 bg-warning-bg text-warning-fg`
- CONTRADICTED: `border-danger-fg/30 bg-danger-bg text-danger-fg`
- SUPERSEDED: `border-border bg-bg-subtle text-fg-subtle line-through`

**Row:** Status badge + timestamp link + speaker attribution + text.
**Contradicted entries:** Show contradicting timestamp link.

**New Commitment Flash:** `@keyframes commitment-enter` — opacity 0→1, translateY -4px→0.

### Notes Scratchpad — Redesign

- `defaultOpen={false}` — collapsed by default
- `bg-bg` textarea background (inset feel)
- `font-mono` for personal notes
- Auto-save status indicator ("Saved locally" / "Unsaved changes")
- `min-h-[100px]`

### Scroll Behavior

Priority order:
1. Participants (always open)
2. Commitment Ledger (open when commitments exist)
3. Notes Scratchpad (closed by default)

### Name Config Modal (Host Only)

- Background: `--bg-elevated`
- Border: `1px solid --border`
- Border-radius: `8px`
- Backdrop: `rgba(0,0,0,0.5)` — no blur
- Max-width: `380px`

### Speaker Quick-Identify

When speaker is `Unidentified`:
```tsx
<button className="mt-1 inline-flex h-[18px] items-center gap-1 rounded-[3px] px-1.5 border border-dashed border-accent/30 bg-transparent font-medium text-[10px] text-accent/70 hover:text-accent hover:border-accent/50">
  <UserCheck size={10} strokeWidth={1.5} />
  Identify speaker
</button>
```

Clicking opens inline form for host to type a name.

---

*Last revised: May 2026*
