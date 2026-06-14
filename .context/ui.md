# Larity — UI Design Specification

> Living document. Update as we work through individual pages/screens.

---

## 1. Design Philosophy

- **Positioning**: "Command center meets calm productivity tool" — Linear, Vercel, Granola, Arc Browser energy. Dense, precise, never cluttered.
- **Avoid AI-slop signals**: no purple/blue gradients, no glassmorphism, no gradient text/buttons, no heavy drop shadows, no uniform `rounded-2xl` everything.
- **Elevation via borders + flat surface shifts**, not shadows.
- **Editorial restraint**: one signal accent color, desaturated semantic colors, hairline borders, tight type scale, tabular numbers for metrics.
- **Dual theme**: dark-first (primary use case — live meeting overlay, low glare), light theme as a fully polished alternative for daytime/dashboard use — not an afterthought inversion.

---

## 2. Typography (shared across themes)

| Role | Font | Notes |
|---|---|---|
| UI / Headings | **Geist** (fallback: Inter Tight) | `-0.01em` to `-0.02em` letter-spacing on headings |
| Body / Transcript | **Inter** | line-height `1.6` for transcript readability |
| Mono (timestamps, speaker tags, IDs, confidence %, costs) | **Geist Mono** (fallback: JetBrains Mono / Berkeley Mono) | `font-variant-numeric: tabular-nums` |

**Type scale** (px): `12 / 13 / 14 / 16 / 20 / 28 / 36`
Most UI copy sits at **13px**. Reserve 16px+ for page titles and hero numbers only.

**Radius scale**:
- Cards/panels: `8–10px`
- Buttons/inputs: `6px`
- Pills/badges: full round
- Data tables: `0–4px` (sharp)

**Borders**: `1px solid` hairlines as primary separators in both themes.

---

## 3. Dark Theme — "Graphite & Signal"

### Base / Surfaces
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0B0C0E` | App background (warm-tinted black) |
| `--bg-elevated` | `#141517` | Cards, panels, sidebars |
| `--bg-overlay` | `#1C1E21` | Hover/active surfaces, inputs, modals |
| `--border` | `rgba(255,255,255,0.08)` | Default hairline border |
| `--border-strong` | `rgba(255,255,255,0.14)` | Emphasized dividers, focused inputs |

### Text
| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#F2F2F0` | Primary content (off-white) |
| `--text-secondary` | `#9A9DA3` | Labels, metadata, timestamps |
| `--text-tertiary` | `#6B6E73` | Disabled, placeholder |

### Accent (chosen)
| Token | Value | Usage |
|---|---|---|
| `--accent` | `#A8D62E` (electric lime) | Primary CTA, active states, live indicator |
| `--accent-muted` | `rgba(168,214,46,0.12)` | Accent backgrounds (selected rows, active tab bg) |
| `--accent-fg` | `#1A2406` (deep lime-black) | Text on accent-filled elements |

### Semantic / Alert Colors (desaturated ~15-20%)
| Token | Value | Maps to |
|---|---|---|
| `--danger` | `#D9665A` | Tier 4 BLOCK, contradicted commitments |
| `--warning` | `#D4A853` | Tier 4 WARNING, tone alerts |
| `--info` | `#7C9CB3` | Tier 4 INFO, neutral pipeline notices |
| `--success` | `#8FAE82` | Confirmed commitments, resolved items |
| `--danger-bg` | `rgba(217,102,90,0.10)` | Alert card backgrounds |
| `--warning-bg` | `rgba(212,168,83,0.10)` | — |
| `--info-bg` | `rgba(124,156,179,0.10)` | — |
| `--success-bg` | `rgba(143,174,130,0.10)` | — |

### Texture
- Optional 2–3% opacity noise/grain overlay on `--bg` for depth (Linear/Arc-style). Skip if it adds render cost to Tauri webview.

---

## 4. Light Theme — "Paper & Signal"

Goal: not a naive inversion. Warm paper tones, same restraint, same accent identity carried through with adjusted contrast.

### Base / Surfaces
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#FAFAF8` | App background (warm off-white, not pure white) |
| `--bg-elevated` | `#FFFFFF` | Cards, panels, sidebars |
| `--bg-overlay` | `#F0F0EE` | Hover/active surfaces, inputs |
| `--border` | `rgba(15,15,15,0.08)` | Default hairline border |
| `--border-strong` | `rgba(15,15,15,0.14)` | Emphasized dividers, focused inputs |

### Text
| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#1A1B1D` | Primary content (near-black, not pure black) |
| `--text-secondary` | `#6B6E73` | Labels, metadata, timestamps |
| `--text-tertiary` | `#A0A3A8` | Disabled, placeholder |

### Accent (chosen)
| Token | Value | Usage |
|---|---|---|
| `--accent` | `#7A9E1E` (electric lime, deepened) | Primary CTA, active states, live indicator |
| `--accent-muted` | `rgba(122,158,30,0.10)` | Accent backgrounds |
| `--accent-fg` | `#FFFFFF` | Text on accent-filled elements |

### Semantic / Alert Colors (deepened slightly for light-bg contrast)
| Token | Value | Maps to |
|---|---|---|
| `--danger` | `#C2493D` | Tier 4 BLOCK, contradicted commitments |
| `--warning` | `#B8893A` | Tier 4 WARNING, tone alerts |
| `--info` | `#5A7E96` | Tier 4 INFO, neutral pipeline notices |
| `--success` | `#6D9261` | Confirmed commitments, resolved items |
| `--danger-bg` | `rgba(194,73,61,0.08)` | Alert card backgrounds |
| `--warning-bg` | `rgba(184,137,58,0.08)` | — |
| `--info-bg` | `rgba(90,126,150,0.08)` | — |
| `--success-bg` | `rgba(109,146,97,0.08)` | — |

### Texture
- Avoid noise overlay on light theme (reads dirty). Rely on hairline borders + subtle `--bg` vs `--bg-elevated` contrast for depth.

---

## 5. Cross-Theme Component Rules

- **Elevation**: never use `box-shadow` for card elevation. Use `background-color` step (`--bg` → `--bg-elevated`) + `1px solid var(--border)`.
- **Buttons**: solid fills only (no gradients). Primary = `--accent` bg / `--accent-fg` text. Secondary = `--bg-overlay` bg / `--border` outline.
- **Badges/Pills**: full radius, semantic-bg + semantic-text color pairing (e.g. `--warning-bg` bg + `--warning` text).
- **Tables/dense lists**: sharp radius (0–4px), row hover = `--bg-overlay`, no zebra striping.
- **Focus states**: `1px solid var(--accent)` ring, no glow/blur.
- **Live/listening indicator**: pulse animation on `--accent`, spring easing, no bounce.
- **Numeric displays** (costs, confidence %, timers): mono font, `tabular-nums`, right-aligned in tables.

---

## 6. Open Decisions

- [x] ~~Finalize accent: amber/copper vs lime~~ — **Decided: electric lime** (`#A8D62E` dark / `#7A9E1E` light)
- [ ] Confirm Geist availability in Tauri bundle vs Inter Tight fallback
- [ ] Decide on noise overlay for dark theme (perf check in Tauri webview)

---

## 7. Page-by-Page Notes

*(To be filled in as screenshots are reviewed)*

### Dashboard / Home

**Current rating: 6/10** — bones are good (logo lettering, hairline-bordered cards, status bar), but reads as a default dark dashboard template rather than premium.

**Issues identified**
- Background is near-pure-black, flat against card surfaces — apply the `--bg` / `--bg-elevated` step from §3 (`#0B0C0E` / `#141517`) for actual depth.
- Generic yellow on "Prepped" badge and "Open Commitments" bullet dots reads as unassigned default color, not a chosen brand accent. Replace with the single chosen `--accent` token, used deliberately.
- Too many competing white-filled "primary" buttons ("Add client", "Add member", "Join Meeting") — white fill should be reserved for the single most important action. Demote secondary actions to ghost/outline (`--bg-overlay` bg + `--border` outline).
- "Start meeting" / "Join meeting" toggle reads as two unrelated buttons, not a segmented control. Needs a shared track background with the active segment getting `--bg-elevated` + border.
- Inconsistent pill system: avatar initials (AC/TC/AP/TE), client name tags, "1t 2c" count badges, and "Prepped" status badge all use different shapes/weights. Define one pill spec (height, radius, padding) — reserve color only for semantic status (e.g. Prepped).
- Flat section hierarchy — "TODAY" / "RECENT ACTIVITY" / "OPEN COMMITMENTS" labels are same weight/size as content. Should be `11px`, `letter-spacing: 0.06em`, uppercase, `--text-tertiary` — clearly subordinate.
- "Today" card has excess dead space with only one meeting listed — either shrink to content height or surface a prep-brief preview snippet.
- Cryptic count notation (`1t 2c`, `11m 1d 1t 1c`, `2d 1t 2c`) is unexplained — needs icons/labels or move to hover tooltip.
- Note: "SW · Aman" is the org name followed by the current user's name — a static identity label, not an interactive org switcher.

**Refactor suggestions**
- Background → `#0B0C0E`, cards → `#141517`, borders → `rgba(255,255,255,0.08)`.
- Single accent (electric lime, per §3) applied to: active meeting indicator, primary CTA fill, "Prepped" status pill, open-commitment dots — nowhere else.
- Reduce visual weight of "Sign Out" — move to a small avatar/menu rather than a top-level text link competing with nav.
- "Recent Clients" → horizontal row of smaller, denser pills (current size is oversized relative to overall density).

**New features to consider**
- **Cost gauge**: small persistent indicator (dashboard or status bar) showing Tier 4 spend vs. $1.60 warning / $2.00 hard cap thresholds — reinforces "intelligent system" positioning.
- **Pre-meeting brief preview**: "Prepped" badge should expand/hover to show actual brief contents (risks, agenda suggestions), not just a status flag.
- **Live session indicator**: if a meeting is in progress, surface a pulsing accent dot + "rejoin" CTA prominently on the dashboard.

**Possibly remove/simplify**
- "Add client" / "Add member" — if infrequent admin actions, move into a settings/org menu instead of top-level buttons competing with the meeting CTA.
- Cryptic count badges (`1t 2c` etc.) — expand with icons/labels or move to tooltip.

### Waiting Room

**Current rating: 5.5/10** — strong content/information architecture (this is the pre-meeting brief feature showing real value), weakest visual execution so far; most "default Tailwind dark mode" of the screens reviewed.

**Issues identified**
- "Join Call Now" uses a generic saturated Tailwind blue — the strongest AI-slop signal across all screens reviewed; will visually conflict with whichever accent is chosen.
- `$` icon for "Pre-Meeting Intelligence" is a mismatched metaphor (this section is strategic/relationship context, not financial) — reads as placeholder.
- Inconsistent left-border accent usage: Pre-Meeting Intelligence uses blue, Contextual Landmines uses red border + red header text + red bullets — overloads red with both "warning label" and "bullet marker" duty, making informational content feel alarming.
- "CONTEXTUAL LANDMINES" styled as an error/danger state (all-caps red, warning triangle) but content is informational context, not a failure — visual weight mismatched to actual stakes.
- Checkbox rows in Suggested Agenda / You Owe / They Owe look like generic form inputs with excess padding, not a curated AI-generated checklist.
- Right sidebar has large empty space below the two agenda items.
- "Add discussion point…" input + circular plus button sits isolated at bottom-right with no visual connection to "Meeting Agenda" card above it.
- Participants card (single host, lightweight) feels disconnected from the dense Pre-Meeting Intelligence card below it.
- Overall palette relies on raw blue (CTA, icon, agenda numbers) and red (landmines) rather than the chosen single accent + semantic tokens from §3.

**Refactor suggestions**
- Replace blue "Join Call Now" with `--accent` fill — this is the primary CTA and the one saturated element on the page, but in the chosen brand color.
- Move Participants into the header row (small avatar stack next to meeting title) instead of a separate card, freeing vertical space.
- Replace `$` icon with an insight-oriented icon (e.g. lightbulb/sparkles/brain).
- Pre-Meeting Intelligence left border → `--accent` or `--info` (steel blue), not raw blue; tighten card padding for dense prose.
- Reframe Contextual Landmines using `--warning` (muted gold) instead of red, and a neutral icon (eye/flag) instead of a warning triangle — reserve `--danger` for genuinely critical items (Tier 4 BLOCK, contradicted commitments) so it retains meaning elsewhere.
- Restyle agenda/task checkboxes as compact task-list items with hover affordance, tighter row height.
- Align "No pending tasks" empty state styling with other empty states across the app (e.g. "No commitments classified yet").
- Connect "Add discussion point" input to the Meeting Agenda card visually — nest inside its footer or match its card styling.

**New features to consider**
- Client Persona snapshot in the sidebar (tone, preferences, objections, priorities) — `ClientPersonaWorker` already generates this data; fills sidebar dead space and reinforces "vetting phase, skeptical of vendor reliability" framing already present in the brief.
- Severity tiering for Contextual Landmines if some are more critical than others (subtle dot color).

### Live Meeting View

**Current rating: 6.5/10** — core differentiator screen, currently undercooked relative to pipeline sophistication.

**Issues identified**
- Purple radial glow behind page title is the strongest AI-slop signal in the app — remove entirely, replace with a flat accent dot if a "live" marker is needed.
- Two unrelated-colored "live" indicators (purple-ish dot near "ACME CORP", green dot in participant row) with no shared meaning — consolidate to one live-state color.
- "EXTERNAL" speaker tag styling (icon + bordered box) doesn't match the unified pill spec — needs alignment with dashboard client tags.
- No per-speaker visual differentiation in transcript beyond text tag — all utterances look identical; will become a wall of text with multiple speakers.
- Sidebar (Participants, Commitment Ledger, Agenda, Notes) reads as a flat, unstyled accordion with no visual rhythm — given ledgers update live, this should feel dynamic, not static.
- "No commitments classified yet" reads as inert empty-state text with no anticipation of live updates.
- "Identify speaker" dashed-border button looks like a dev/debug affordance, not a designed interaction.
- Agenda number badges (`1`, `2` in bordered squares) are oversized relative to overall density.
- Large empty space below transcript and in sidebar with no ambient "system is listening" signal.
- Top-right icon cluster (share/transfer, bookmark, bell) is unlabeled and inconsistently sized vs. End Meeting button.
- "Audio diagnostics & controls" collapse chevron doesn't match other section chevrons.

**Refactor suggestions**
- Remove purple glow; keep a single pulsing `--accent` dot before "ACME CORP" as the only live indicator (motion per §5).
- Group top-right icons into one toolbar segment, consistent sizing, with tooltips.
- Add a thin per-speaker left-border (2-3px) on transcript utterances, color matched to each speaker's avatar initial in the sidebar.
- Tighten vertical rhythm between transcript utterances.
- Surface inline markers on utterances when pipeline tiers fire (Tier 1 keyword hit, Tier 4 alert) — small icon + tooltip, in addition to the separate Alerts tab.
- Differentiate sidebar section prominence: Commitment Ledger and Alerts (active intelligence output) get more visual weight than static Agenda/Notes — e.g. accent header or live count badge.
- Replace "No commitments classified yet" with a subtle "listening for commitments…" pulse state.
- Restyle "Identify speaker" as a proper small ghost-button per the unified component spec.
- Resize agenda number badges to match the standard pill/badge spec.
- Pick one expand/collapse chevron style and apply it across all sidebar sections and the diagnostics panel.

**New features to consider**
- Live pipeline status strip (e.g. "Tier 2 analyzing…") — communicates active analysis, core to the value prop.
- Cost gauge near the meeting timer in the top bar (Tier 4 spend vs. $1.60/$2.00 thresholds).
- Inline tone-trajectory indicator per speaker in the sidebar, surfacing `SpeakerStateTracker` output.

### Meeting Overlay

**Current rating: 7/10** — most product-defining screen; floating overlay format and alert card structure are strong, but supporting elements need tightening.

**Issues identified**
- Lime/yellow-green dot marking the triggering utterance is styled almost identically to a normal transcript line, despite directly causing the alert below — weak visual link between cause and alert.
- With electric lime now the single accent, the prior lime-dot/amber-border distinction collapses into one color — but the ambient gradient (left as-is per earlier instruction) may still need its own semantic logic (severity-based) separate from the accent.
- Pixel-grid avatar placeholder for "Aman" looks like a broken image/loading state rather than a designed avatar.
- "TEAM" badge styling doesn't match "EXTERNAL" badge from the meeting mode screen — different padding/weight.
- Bottom toolbar icons (End, bell, expand, bookmark) are small and tightly packed against edges for a glanceable overlay.
- Timestamp format inconsistency: alert shows "01:27:02 PM" while the top timer shows "02:20" (elapsed) — different formats in the same view.
- Note: with lime now reserved for "live/positive/CTA" meaning, a "High · Risky commitment" alert (as in this screenshot) should likely use `--warning` (muted gold) or `--danger` (muted red) for its left-border/header, not the accent — keeps lime meaningful as "system is live and working in your favor" vs. "something needs attention."

**Refactor suggestions**
- Keep the left-border alert treatment using `--accent` (electric lime), as *the* primary accent application, consistent with dashboard CTAs and the meeting-mode live indicator. Note: for genuinely high-severity alerts (Tier 4 BLOCK), consider whether `--danger` should override the accent on the border — to be decided when reviewing actual alert-severity variety.
- Link the triggering utterance to its alert visually — same accent-color marker, or a thin connecting line between utterance and card.
- Replace pixel-grid placeholder with initials-on-`--accent-muted` circle, matching the AC/TC pattern from the dashboard.
- Unify "TEAM" / "EXTERNAL" / "Host" badges into one pill component (height, radius, padding, weight) across all screens.
- Give the header row (`Acme Corp · Untitled meeting · timer`) a subtle `--bg-elevated` background or bottom hairline; give the bottom toolbar a distinct `--bg-elevated` strip with top hairline and larger icon spacing/touch targets.
- Standardize timestamp format across all surfaces (pick one of `HH:MM:SS` mono or `h:mm a`).

**New features to consider**
- Multi-alert stacking behavior (queue, stack, or replace) for when Tier 4 fires multiple alerts in quick succession — worth speccing before it becomes a UX problem.

### Organizational Memory / Search
—

