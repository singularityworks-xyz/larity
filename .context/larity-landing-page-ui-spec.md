# Larity — One-Page Intro Site
## UI Design Spec Sheet v1

---

## 0. Direction Summary

**Concept:** *Clarity is the product, so clarity is the design.* Every meeting starts as noise — overlapping voices, half-formed decisions, contradictions nobody catches in the moment. Larity turns that into structure live. The page should perform the same trick: it opens a little loose and atmospheric, then visibly resolves into clean, confident structure as you scroll, mirroring what the product does to a meeting.

**Why not a Cluely clone:** Cluely's site earns its premium feel through a pinned, narrated product demo, oversized floating UI panels on a light lavender field, and a mosaic of saturated gradient cards for features. That structural language — real product UI as the hero, scroll-narrated walkthrough, asymmetric card mosaic, big mono stat callouts — is the right reference frame and is used below. But Cluely's brand thesis is "invisible / undetectable." Larity's thesis is the opposite: *visible, structured, accountable.* So the copy, the signature motion device, and the color logic all point at clarity-emerging-from-noise rather than stealth. Same caliber of craft, different soul.

**Signature element — "The Clarity Thread":** a single thin line that runs the spine of the page (left margin on desktop, top of each section on mobile). At the hero it's a jittery, hand-wobbled scribble. Section by section, as you scroll, it visibly straightens out, until by the footer it's a perfectly clean, confident horizontal rule. Twice along the way it spikes sharply and flashes clay (the contradiction color) for ~400ms — that's the "contradiction caught" moment, the one thing Larity actually does that no notetaker does. This is the one bold, memorable device on the page; everything else stays quiet around it.

---

## 1. Design Tokens

### 1.1 Color

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F7F4EA` | Page background. Warm, slightly textured-feeling ivory — actual paper, not clinical white. Pairs naturally with the olive/ink combination below the way cream stock pairs with green or black ink. |
| `ink` | `#181B22` | Primary text, nav, icons. Near-black, unchanged — it's neutral enough to sit comfortably against the new warm palette without fighting it. |
| `olive` | `#84A62F` | Brand primary. Fills only: primary CTA background, hero gradient blob, card tints, dark-band digit accents. Reserved for surfaces a darker foreground sits on top of — see the contrast note below for why it isn't used as foreground text. |
| `olive-deep` | `#5E7522` | Olive's text-safe twin. Used anywhere olive needs to function as foreground content directly on `paper` — the italic emphasis word in headlines, links, the thread's default stroke, focus outlines. |
| `moss` | `#3E5E1F` | Secondary accent. "Resolved / agreed / logged" states, secondary badges, checkmarks. Dark enough to double as foreground or fill. |
| `sand` | `#EFEAD8` | Card and surface fill. Used instead of borders to separate zones — soft fields, not boxes. |
| `clay` | `#B0472A` | Reserved exclusively for contradiction/attention moments (the thread spike, the live contradiction-catch demo). Never used decoratively — if it's clay, something was just caught. |

Supporting neutrals: `ink/60` (`rgba(24,27,34,0.6)`) for secondary copy, `ink/10` for hairline dividers used only where a true separation is needed (e.g. FAQ rows).

**Contrast note on `olive`:** `#84A62F` is a bright, mid-toned green — gorgeous as a fill, but text directly on or in it (olive-on-paper, or white-on-olive) only clears ~2.8:1, below the 4.5:1 WCAG AA threshold. Two fixes are baked into the system above rather than touching the hex you gave: (1) primary buttons use `olive` fill with **ink-colored** label text, not white — ink-on-olive clears ~6:1; (2) anywhere olive needs to act as foreground/text/line content on `paper`, use `olive-deep` instead, which clears ~4.8:1. `moss` and `clay` are both naturally dark enough to work as foreground or fill without needing a second twin.

This is a closed, meaningful palette — not a moodboard. Olive = brand/default. Moss = agreement/resolution. Clay = contradiction. The color system literally encodes what the product does, which is the point. One side effect worth flagging: this revised palette lives in a narrower warm green/brown hue family than the original violet–teal–coral spread, so don't lean on color alone to tell "resolved" apart from "contradiction" at a glance — keep pairing moss/clay with the icon and label already specified in each component, not just the tint.

### 1.2 Type

Three roles, deliberately not the "geometric grotesk for everything" default.

- **Display — Fraunces** (variable, optical sizing on). Warm, slightly wonky soft-serif at large sizes. Used for H1/H2 only, set at high optical size (`opsz` 144) so it has real personality, not a thin editorial serif pretending to be friendly.
- **Body / UI — Inter**. Neutral, dense, does its job at small sizes for paragraphs, nav, buttons, FAQ.
- **Utility / Data — JetBrains Mono**. Used only for things that are literally data in the product: timestamps, the `00:14:32`-style transcript clock, stat numbers in the metrics band, the latency figure. Ties the type system to the product's own transcript UI instead of being an arbitrary third font.

| Style | Font | Size (desktop) | Size (mobile) | Weight | Tracking | Line height |
|---|---|---|---|---|---|---|
| Eyebrow | Inter | 13px | 12px | 600 | +0.08em, uppercase | 1.2 |
| H1 (hero) | Fraunces | 76px | 38px | 480, italic on emphasis word only | -0.01em | 1.02 |
| H2 (section) | Fraunces | 48px | 30px | 460 | -0.005em | 1.08 |
| H3 (card title) | Inter | 22px | 19px | 600 | 0 | 1.25 |
| Body large | Inter | 19px | 17px | 400 | 0 | 1.5 |
| Body | Inter | 16px | 15px | 400 | 0 | 1.6 |
| Caption | Inter | 13px | 12px | 500 | +0.01em | 1.4 |
| Data / mono | JetBrains Mono | 15px (stats: 56px) | 13px (stats: 34px) | 500 | 0 | 1.1 |

Emphasis pattern: inside an H1/H2, one key word is set in Fraunces *italic* in olive-deep — e.g. "Meetings, *resolved* in real time." That's the entire emphasis vocabulary for the page. No randomly bolded phrases elsewhere.

### 1.3 Space, radius, shadow, grid

- **Spacing scale (px):** 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160 — section vertical padding sits at 128–160px desktop, 64px mobile. Generous whitespace is doing a lot of the "premium" work; don't compress it to fit more in.
- **Radius scale:** `8px` (buttons, pills' corners on rectangular chips), `20px` (standard cards), `32px` (hero panel, large feature cards), `999px` (pills/badges, the nav). Large, soft radii everywhere — zero hard 0–4px corners anywhere on the page. This is the single biggest lever against the "boxy" feeling the brief is rejecting.
- **Shadow:**
  - Float (hero panel, anything that looks "lifted off the page"): `0 30px 80px -30px rgba(45,50,20,0.22)`
  - Resting (mosaic cards): `0 2px 16px rgba(30,28,18,0.07)`
  - Hover lift: `0 16px 40px -12px rgba(45,50,20,0.18)`, paired with `translateY(-4px)`
- **Grid:** 12-column, max content width `1200px`, gutter `40px` desktop / `20px` mobile. The grid is intentionally broken in the feature mosaic and the hero (panel overlaps the headline column) — a perfectly respected 12-col grid everywhere is exactly the "boxy" outcome to avoid.
- **Breakpoints:** mobile `<640px`, tablet `641–1024px`, desktop `1025–1440px`, large `1441px+`. Container stays `1200px` max above desktop and just gains side breathing room.

---

## 2. The Clarity Thread (signature element, detail spec)

- Implementation: one continuous SVG `<path>` positioned `fixed`/`absolute` along the left gutter (desktop) at roughly `x = 64px` from viewport edge, full document height, `stroke-width: 2px`, no fill.
- Path shape: hand-drawn jitter (small randomized sine-wave noise, amplitude ~14px) for the hero and "How Larity Works" sections, with amplitude linearly decaying to 0 by the Stats band, then perfectly straight from Stats through Footer.
- Reveal: `stroke-dasharray` / `stroke-dashoffset` animated via scroll progress (not time) — the line draws itself in step with scroll position, never ahead of where the reader is.
- Color: `olive-deep` default. At the two points in the "Contradiction Spotlight" section that align with a contradiction callout, the path strokes through a `clay` segment (~120px long) that pulses opacity 0.6→1→0.6 once on enter, then settles back to `olive-deep` for the rest of its length.
- Mobile: the thread collapses to a short horizontal rule (~48px) at the top of each section instead of a full vertical spine — same color logic, same clay spike, much lower production cost, no fixed-position scroll math fighting with mobile viewport quirks.
- Reduced motion: thread renders fully drawn and static, clay segments still colored (the meaning survives even when the animation is off).

---

## 3. Global Motion System

- **Scroll reveals:** elements enter at `opacity: 0, translateY: 24px` → `opacity: 1, translateY: 0`, `420ms`, easing `cubic-bezier(0.16, 1, 0.3, 1)` ("ease-out-expo" feel — quick start, soft landing, reads as confident rather than springy). Children inside a group stagger by `80ms`.
- **Pinned demo (How Larity Works):** GSAP ScrollTrigger with `scrub: true` pins the product panel while three text beats crossfade beside it — same mechanism as Cluely's pinned walkthrough, restyled to Larity's panel.
- **Magnetic buttons:** primary CTA buttons track cursor position within a 1.5x bounding box and translate up to `6px` toward it; release with a `300ms` spring back on mouse-leave.
- **Hover lift:** mosaic/feature cards lift `4px` and shadow deepens (see §1.3), `240ms` ease.
- **Contradiction flash:** in the live demo and the Contradiction Spotlight section, the "caught" moment triggers a `200ms` clay pulse + `scale(1.03)` on the relevant transcript line, then settles.
- **Accordion (FAQ):** height animated via CSS grid `grid-template-rows: 0fr → 1fr` trick (not `max-height` hacks), `280ms ease`.
- **Custom cursor:** over interactive product-UI mockups only (not the whole page), cursor becomes a small olive dot with a contextual label (e.g. "⌘↵ ask"), matching the small affordance language Cluely uses around its own UI mockups.
- **Hero demo video:** see §4.2 for the full spec — autoplay/muted/loop/playsinline, paused via `IntersectionObserver` when off-screen, hover/focus-revealed pause control, poster-frame-only under `prefers-reduced-motion`.
- **Reduced motion:** all scroll-pin/parallax/thread-draw effects degrade to instant-state with a simple `200ms` fade. No motion is load-bearing for comprehension — it's all polish, never the only way to read the content.

---

## 4. Section-by-Section Specification

### 4.1 Navigation
- Sticky, transparent over the hero, transitions to `paper` background + hairline bottom border (`ink/10`) once scrolled past hero height, `200ms` ease.
- Left: wordmark "Larity" in Fraunces medium, `ink`. Right: 3–4 text links (Product, How it works, FAQ) + one pill CTA button ("Get the app") in `olive` fill with `ink`-colored label, `999px` radius.
- Mobile: links collapse into a single CTA pill + a minimal hamburger that opens a full-bleed `paper` overlay menu (not a slide-in drawer — keep the "open and welcoming" feel even in the menu state).

### 4.2 Hero
**Layout:** asymmetric two-zone hero, not a centered stack. Left ~55% column: eyebrow label ("AI MEETING INTELLIGENCE"), H1, one line of body copy, primary + ghost secondary CTA. Right ~45%, breaking the column boundary: the floating product panel, tilted `-4deg`, partially overlapping the headline's right edge.

**Background:** `paper` base with one large, very soft olive/moss gradient blob (`blur(80px)`, low opacity ~0.25) positioned behind the floating panel — gives the panel somewhere to "float," avoids flat-white emptiness, stays subtle enough to not compete with text.

**Copy direction (pick one, all on-thesis):**
- "Meetings, *resolved* in real time."
- "Every contradiction. Caught live."
- "Clarity, the moment it happens."

Subhead example: *"Larity listens, transcribes, and flags the moment two people in the room disagree — before the meeting ends, not after you re-read the notes."*

**Floating panel content — a real demo video, not a mockup:** the panel now holds an actual screen-captured loop of Larity's overlay running live: transcript scrolling with mono timestamps, a speaker-diarized line or two, and mid-loop the clay-highlighted "Contradiction detected" chip landing with the flash treatment from §3. Same beat structure as before, just real captured footage instead of a static illustration of it — per the frontend-design principle that the hero should open with the most characteristic thing in the product's world, this is about as characteristic as it gets.

**Demo video — technical spec:**
- **Length & loop:** 10–14 seconds, cut so the last frame matches the first (transcript at rest, no chip showing) — it should be genuinely hard to tell where the loop seams, the way Cluely's hero clip reads as continuous rather than obviously repeating.
- **Format:** `.mp4` (H.264) as the primary source with a `.webm` fallback in the same `<video>` element; `muted`, `autoplay`, `loop`, and `playsinline` attributes set (`playsinline` is required for autoplay to work on iOS Safari, not optional).
- **Weight budget:** target under 2MB total for the panel's visible resolution (it doesn't need to be larger than the panel renders at, even on retina — roughly 960×720 source is plenty for a ~480px-wide floating panel). Compress aggressively; this file loads above the fold and competes with fonts/CSS for first paint.
- **Poster frame:** a static export of the loop's resting frame (transcript scrolling, no chip) shown via the `poster` attribute so the panel never shows blank space while the video buffers — this should look identical to the running video at rest, so there's no visible swap when playback starts.
- **Pause control:** a small ghost icon button in the panel's bottom-right corner, invisible by default and fading in on hover/focus (same reveal language as the custom cursor in §3), lets a viewer stop the loop. Auto-playing motion that runs longer than 5 seconds needs a pause mechanism under WCAG 2.2.2, and a continuously looping clip qualifies even though each individual cycle is short.
- **`prefers-reduced-motion`:** video does not autoplay; the poster frame displays alone with the pause-control corner now showing a play affordance instead, so reduced-motion users get a clear still frame plus the choice to opt in.
- **Playback lifecycle:** pause via `IntersectionObserver` whenever the panel scrolls out of view and resume on return, so the loop isn't burning CPU/battery once the visitor has moved on to later sections.

**How this relates to §4.4:** these are deliberately two different beats, not the same demo twice. The hero loop is a quick, ambient first impression — a few seconds, replayed instantly, no scrolling required, there to make the product feel real in the first second on the page. §4.4 is the slower, scroll-paced walkthrough of the same underlying idea, narrated step by step as the visitor scrolls. Keep §4.4 built from discrete UI-state crossfades (screenshots/CSS, not the video file) rather than trying to scrub this video against scroll position — video-element scrubbing is inconsistent across browsers and will fight the smooth `scrub: true` feel the pinned section is going for.

**CTAs:** primary pill "Get the app" (`olive` fill, `ink`-colored label — see the contrast note in §1.1), secondary ghost "See how it works" (ink text, no fill, underline-on-hover) that smooth-scrolls to §4.4.

### 4.3 Quick-context strip
A single thin band directly under the hero, `sand` background, no cards — just one centered line of body-large text plus three inline mono stat fragments, e.g.:
*"~500ms response time · multi-speaker diarization · 4-stage reasoning pipeline"*
This replaces a fake "as seen in" logo strip (avoid fabricating press/client logos for an early-stage product) with an honest, specific, technically-grounded credibility line.

### 4.4 How Larity Works (pinned scroll narrative)
Three-beat pinned demo, structurally identical to Cluely's pattern but narrating Larity's actual flow:

1. **"Larity listens in."** Panel shows live transcript scrolling, speaker labels appearing, waveform pulsing along the bottom edge (mic-reactive style, matching the in-app overlay aesthetic already established for Larity's product UI).
2. **"It catches what you'd miss."** Panel shows the contradiction-flash moment from §3 — two prior statements visually link with a thin clay connector, "Contradiction" chip appears.
3. **"And turns it into a record."** Panel transitions to a clean summary card — decisions, action items, the contradiction logged with both quoted positions — moss checkmarks settling in one by one.

Text beats sit in the left ~40% column, crossfading as the right-side panel stays pinned center-right. Each beat's heading uses the H3 style; supporting line uses Body.

### 4.5 Feature Mosaic
Asymmetric bento grid — explicitly **not** uniform 3×2 boxes. ASCII layout (desktop):

```
[   Live transcription   ] [ Speaker  ]
[        (wide)          ] [diarization]
                            [  (tall)   ]
[ Contradiction ] [  Four-stage   ]
[   detection   ] [   pipeline    ]
[   (square)    ] [    (wide)     ]
```
- Each card: `sand`-toned or very softly tinted background (one card olive-tinted, one moss-tinted, one clay-tinted, one neutral sand) — never more than four cards, never identical sizes, `32px` radius, generous internal padding (`48px`).
- Card anatomy: small icon top-left (line-style, single-weight, ink or accent-colored), H3 title, one sentence of Body copy. No bullet lists inside cards — one clear sentence each, per the writing guidance (specific over clever, one job per element).
- On scroll-in, cards stagger-reveal per §3; on hover, lift per §3.

### 4.6 Live numbers band
Dark contrast moment — the one section that inverts to `ink` background with `paper` text, purely for rhythm (a light page that never varies its contrast for 4000px reads flat). Three big mono numerals, large (`56px`), olive or moss accent on the digits only — bright `olive` reads beautifully against dark `ink`, the one place its low contrast-on-light limitation works in its favor — label in small caps Inter beneath each:
- `500ms` — "Average response time"
- `4` — "Reasoning stages per turn"
- `99%` (placeholder — replace with a real, defensible figure before ship) — "Speaker attribution accuracy"

Note: don't ship invented accuracy/percentage claims — swap in real benchmarked numbers once available; structurally the slot is reserved either way.

### 4.7 Contradiction Spotlight
A dedicated, slower-paced section for the actual differentiator (most meeting tools just transcribe; Larity disagrees with itself in public). Large single demo, not pinned this time — a static-feeling but subtly animated card showing two speakers' statements stacked, connected by the clay thread-spike, with a single confident line of copy above it:

*"Said one thing in the kickoff. Said the opposite in the follow-up. Larity caught it before anyone else did."*

This is the section that earns the clay color and the thread's one dramatic beat — keep everything else around it quiet so this lands.

### 4.8 CTA / Download band
Full-width band, soft olive-to-moss gradient mesh background (low saturation, premium not neon), centered content: H2 ("Stop re-reading meetings to find what was decided." or similar), one CTA pill, small caption underneath ("Free to try · macOS & Windows" or whatever is accurate at ship time — don't fabricate platform availability beyond what's actually shipped).

### 4.9 FAQ
Simple single-column accordion, max-width `720px`, centered. Each row: question in H3, hairline `ink/10` divider below, chevron rotates `180deg` on open. Animation per §3. 5–6 questions max — mirror Cluely's restraint here (their FAQ titles list 6 questions, nothing more).

### 4.10 Footer
Minimal, `paper` background, hairline top divider. Wordmark left, three link columns (Product, Support, Legal) right, social icons bottom row, copyright line. No surprises here — footers are where restraint is expected and noticed if violated.

---

## 5. Component Specs

- **Primary button:** `olive` fill, `ink`-colored text (not white — see §1.1 contrast note), `999px` radius, `16px/32px` padding, Inter 600. Hover: magnetic tracking (§3) + background deepens to `olive-deep`, label crossfades from `ink` to `paper` in step with the fill darkening, so contrast stays correct at both ends of the transition.
- **Secondary/ghost button:** transparent fill, `ink` text, `1px` `ink/20` border, same radius/padding. Hover: border shifts to `ink`, no fill change — keep it quiet.
- **Pills/badges** (e.g. "Contradiction" chip): `999px` radius, `13px` Inter 600, colored per §1.1 logic (`clay` bg / `paper` text for contradiction, `moss` bg / `paper` text for resolved).
- **Cards:** see §4.5 anatomy. Never a hard border — separation comes from background tint + shadow only.
- **Accordion row:** see §4.9.
- **Nav:** see §4.1.

---

## 6. Accessibility & Performance Notes

- Maintain WCAG AA contrast: `ink` on `paper` passes comfortably (effectively unchanged from the previous palette). `olive` itself is the one token to watch — at `#84A62F` it clears roughly 2.8:1 against both white and `ink`, under the 4.5:1 AA threshold for normal text. The system handles this two ways, already reflected above: primary buttons pair `olive` fill with `ink` (not white) text, and any foreground/text use of the brand green on `paper` (links, headline emphasis, the thread, focus rings) uses `olive-deep` instead, which clears ~4.8:1. `moss` and `clay` are dark enough to pass AA as either fill-with-light-text or foreground-on-paper without needing a second variant.
- Visible keyboard focus state on every interactive element: `2px` `olive-deep` outline, `2px` offset — don't rely on browser default, but don't remove it either.
- `prefers-reduced-motion` respected throughout per §3 — nothing in the page depends on animation to be understood.
- Pinned/scrubbed scroll sections (§4.4) should have a static fallback layout (simple stacked sections) on touch devices below tablet width rather than attempting scroll-pin on mobile viewports.
- The hero's demo video (§4.2) is the one place video weight matters most — hold it to the ~2MB budget specified there, ship the poster frame so there's never a blank panel, and make sure the hover-revealed pause control actually works before this ships, since autoplaying loops over 5 seconds need a pause mechanism for WCAG 2.2.2 compliance regardless of how short each cycle feels.
- This palette sits in a tighter warm green/brown hue range than a typical violet–teal–coral spread, so treat color as reinforcement, not the sole signal — `moss` (resolved) and `clay` (contradiction) should always carry their existing icon/label alongside the tint, not the tint alone.

---

## 7. Suggested Stack

Given the existing Singularity Works site already runs React/TypeScript + Tailwind + GSAP ScrollTrigger + TanStack Router, this page slots into the same stack directly: Tailwind for the token system in §1 (extend the config with the named colors/radii rather than using raw hex inline), GSAP ScrollTrigger for the pinned demo (§4.4) and the thread's scroll-synced draw (§2), and plain CSS custom properties for anything that needs to respond to `prefers-reduced-motion` at the stylesheet level.
