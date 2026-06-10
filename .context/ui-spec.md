# LARITY — UI SPEC SHEET

> The visual contract for every Larity surface (desktop overlay, desktop main
> window, control web app). Pairs with `user-flow.md` (page inventory) and
> `architecture-and-flow.md` (system behavior).

**Aesthetic target.** Cursor-dark base + Vercel formal restraint. Near-black
surfaces, hairline borders, soft iOS-like corners, dense typography, primarily
monochromatic UI. No neon gradients, no decorative shadow,
no marketing flourish. The product looks like a tool, not a brand.

**Theme rule.** Dark only in v1. There is no light mode. Light values below
exist solely as inversions for high-contrast print exports.

---

## 1. Design Principles

1. **Soft over sharp.** iOS-like corner smoothing by default; 12px for cards,
   8px reserved for interactive controls.
2. **Hairlines do the work.** A single 1px border on `--border` separates
   surfaces. Avoid shadow as a separator.
3. **Monochromatic.** Color is for state, not decoration. Grayscale accent (`--accent`),
   plus four semantic states (success/warning/danger/info).
4. **Density is a feature.** Operators are reading lots of small data.
   Default density is compact; comfortable density is opt-in.
5. **No layered translucency.** Surfaces are flat colors, not blurs. The
   overlay is exempt and uses one calibrated translucent layer.
6. **Motion is utility.** ≤200ms, ease-out, opacity + small translate only.
   No springs, no bounce, no parallax.
7. **Type carries hierarchy.** Weight + size + color, in that order. Avoid
   uppercase tracking-as-decoration.
8. **One focus ring shape.** Every focusable element uses the same 1px outer
   ring (`--ring`) with a 1px gap.

---

## 2. Color Tokens

All values are CSS variables, defined once at `:root` and consumed via
Tailwind / shadcn-compatible token names. Colors named after their role,
not their hex.

### 2.1 Neutrals (the spine of the system)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#000000` | App background. Pure black, Vercel-style. |
| `--bg-elevated` | `#0A0A0A` | Cards, popovers, sheets sitting on `--bg`. |
| `--bg-subtle` | `#111111` | Hover surface, inset rows, code blocks. |
| `--bg-emphasis` | `#171717` | Active row, selected state, table header. |
| `--surface-overlay` | `#0E0E0EE6` | Live overlay window background (90% opacity). |
| `--border` | `#262626` | Default 1px border. |
| `--border-strong` | `#3A3A3A` | Hover border, focus ring base. |
| `--border-subtle` | `#1A1A1A` | Internal dividers within a card. |
| `--fg` | `#EDEDED` | Primary text. |
| `--fg-muted` | `#A1A1A1` | Secondary text, labels, metadata. |
| `--fg-subtle` | `#6B6B6B` | Disabled, placeholder, axis ticks. |
| `--fg-on-accent` | `#0A0A0A` | Text on `--accent` fills. |

### 2.2 Accent (one, and only one)

Monochromatic (pure white or grey), used sparingly. Never as a background for large regions; only
as a text color, a 1–2px stroke, or a small fill on the primary action.

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#FFFFFF` | Primary action fill, key indicator dot, link. |
| `--accent-hover` | `#E0E0E0` | Primary action hover. |
| `--accent-pressed` | `#C0C0C0` | Primary action active. |
| `--accent-subtle` | `#FFFFFF1A` | Selected row tint (10% accent). |
| `--accent-fg` | `#000000` | Text on accent fill. |

### 2.3 Semantic states

Each state has a `-fg` (text + icon) and a `-bg` (10% wash for backgrounds).
Borders use the `-fg` value at full opacity, 1px.

| Token | Hex | Use |
|---|---|---|
| `--success-fg` | `#3FB950` | Confirmed commitments, healthy status. |
| `--success-bg` | `#3FB9501A` | |
| `--warning-fg` | `#D29922` | Tentative, scope-creep alert, missing-clarity. |
| `--warning-bg` | `#D299221A` | |
| `--danger-fg` | `#F85149` | Contradiction, policy violation, critical alert. |
| `--danger-bg` | `#F851491A` | |
| `--info-fg` | `#58A6FF` | Ambient, informational. |
| `--info-bg` | `#58A6FF1A` | |

### 2.4 Alert routing colors (live overlay)

Two distinct treatments so a glance is enough.

| Routing | Left border | Background | Icon |
|---|---|---|---|
| **Shared** (whole team) | 2px `--accent` | `--bg-elevated` | `users` |
| **Personal** (only you) | 2px `--warning-fg` | `--bg-elevated` | `user` |

Severity overrides background only for `critical`: background becomes
`--danger-bg`, border stays per-routing.

### 2.5 Speaker chips

| Speaker type | Chip background | Chip text |
|---|---|---|
| TEAM (other) | `--bg-subtle` | `--fg` |
| TEAM (current user) | `--accent-subtle` | `--accent` |
| EXTERNAL | transparent + 1px `--border-strong` | `--fg-muted` |
| Unidentified | transparent + 1px dashed `--border-strong` | `--fg-subtle` |

---

## 3. Typography

### 3.1 Families

| Token | Stack | Use |
|---|---|---|
| `--font-sans` | `"Geist", "Inter", system-ui, sans-serif` | All UI text. |
| `--font-mono` | `"Geist Mono", "JetBrains Mono", ui-monospace, monospace` | Transcripts, IDs, timestamps, code, diagnostic values. |

`Geist` is the primary because it pairs the Vercel formality with a slightly
warmer humanist feel that suits dense product UIs better than pure grotesks.

### 3.2 Scale

| Token | Size / Line-height | Weight | Use |
|---|---|---|---|
| `text-2xs` | `10px / 14px` | 500 | Tray pills, micro-labels. |
| `text-xs` | `11px / 16px` | 500 | Table metadata, captions, badge text. |
| `text-sm` | `12px / 18px` | 500 | Default body in dense views. |
| `text-base` | `13px / 20px` | 500 | Default body. |
| `text-md` | `14px / 22px` | 500 | Form inputs, primary list rows. |
| `text-lg` | `16px / 24px` | 600 | Section labels, card headings. |
| `text-xl` | `20px / 28px` | 600 | Page subheadings. |
| `text-2xl` | `24px / 32px` | 600 | Page titles. |
| `text-3xl` | `32px / 40px` | 600 | Brand mark only. |

### 3.3 Style rules

- No uppercase headings. No letter-spacing tweaks except mono numerics.
- Mono is mandatory for: timestamps, IDs (`m_01H...`), durations, counts,
  monetary amounts, latency values, transcript text in `/meetings/:id`.
- Numerals: enable `font-feature-settings: "tnum" 1, "ss01" 1, "ss03" 1`
  for tabular numerals everywhere data is compared.
- Links inside body text use `--accent` color, no underline, 1px underline
  on hover.

---

## 4. Spacing & Layout

### 4.1 Spacing scale (4px grid)

`0` `2` `4` `6` `8` `12` `16` `20` `24` `32` `40` `48` `64` (px).

The system never invents values outside this scale. Half-step (`2`) is
allowed only inside controls (icon ↔ label gaps).

### 4.2 Container widths

| Surface | Max content width |
|---|---|
| Desktop main window | `1280px`, side padding `24px` |
| Desktop overlay | fixed `360px`, vertical auto-height |
| Web app dashboard | `1440px`, side padding `32px` |
| Web app reading views (meeting detail, decision detail) | `1024px` text column |
| Settings | `720px` |

### 4.3 Density modes

| Mode | Row height | Input height | Default |
|---|---|---|---|
| Compact | `28px` | `28px` | Tables, lists, transcripts. |
| Comfortable | `36px` | `36px` | Forms, settings, sheets. |

User-toggleable in `/settings/appearance`.

---

## 5. Border Radius (iOS-like smoothing)

| Token | Value | Where |
|---|---|---|
| `--radius-0` | `12px` | Default. Cards, panels, sheets, table rows, alerts, transcript bubbles, charts, modals, page surfaces. |
| `--radius-1` | `8px` | Interactive controls only: buttons, inputs, selects, checkboxes, segmented controls, badges, chips, kbd hints. |
| `--radius-pill` | `999px` | **Forbidden.** Do not use. Status indicators are 0 or 2px rectangles. |

Avatars are an exception: 8px square with a 1px `--border` ring. No circles.

---

## 6. Borders & Dividers

- Default border: `1px solid var(--border)`.
- Hover border on interactive elements: `1px solid var(--border-strong)`.
- Focus ring (every focusable element): `1px solid var(--accent)` outer ring
  with `1px` offset using `box-shadow: 0 0 0 1px var(--bg), 0 0 0 2px var(--accent)`.
- Dividers inside cards: `1px solid var(--border-subtle)`.
- Section dividers on settings/profile pages: full-bleed `1px solid var(--border)`.
- Tables: header bottom border `1px solid var(--border)`; row separators
  `1px solid var(--border-subtle)`.

Shadows are off by default. The only allowed shadow is on transient
floating surfaces:

```
--shadow-popover:
  0 0 0 1px var(--border),
  0 8px 24px rgba(0, 0, 0, 0.6);
```

Used only on dropdowns, command palette, popovers, toasts. Never on cards.

---

## 7. Iconography & Imagery

- **Icon set:** `lucide-react`, stroke `1.5`, size `14`/`16`/`20`.
- Icons inherit `currentColor`. They never carry their own color.
- Status dots: `8px` square (not circle), filled with semantic color.
- The product mark is a 1px-stroke wordmark in `--fg`. No logo lockups.
- No illustrations. Empty states use a single `lucide` icon at 24px in
  `--fg-subtle` plus one line of copy.

---

## 8. Motion

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--duration-fast` | `100ms` |
| `--duration-base` | `150ms` |
| `--duration-slow` | `200ms` |

Allowed transitions:

- `opacity` + `transform: translateY(2px → 0)` for entering popovers/alerts.
- `background-color`, `border-color`, `color` on hover.
- Width / height transitions only when content height is fixed (avoid
  layout shift).

Forbidden:

- Spring animations.
- Page transitions on route change.
- Skeleton shimmer (use static dimmed blocks instead).

---

## 9. Components

### 9.1 Button

Variants. Height `28px` (compact) / `32px` (comfortable). Radius `8px`.
Padding `0 12px`. Font `text-sm` / `500`. Icon-only buttons are gently rounded squares.

| Variant | Background | Text | Border |
|---|---|---|---|
| `primary` | `--accent` | `--accent-fg` | none |
| `secondary` | `--bg-subtle` | `--fg` | `1px --border` |
| `ghost` | transparent | `--fg` | none, hover bg `--bg-subtle` |
| `danger` | `--danger-fg` | `#FFFFFF` | none |
| `link` | transparent | `--accent` | none, underline on hover |

States:

- **Hover:** brighten background by ~6%, or apply `--bg-subtle` for ghost.
- **Pressed:** shift background one step darker.
- **Disabled:** `--fg-subtle` text, `--bg-subtle` fill, no hover.
- **Loading:** disabled style + 12px lucide `loader-2` spinning at
  `--duration-slow`.

### 9.2 Input / Select / Textarea

- Height `28`/`32`, radius `8px`.
- Background `--bg-elevated`, border `1px --border`, text `--fg`.
- Placeholder `--fg-subtle`.
- Focus: border `--accent`, with `box-shadow: 0 0 0 1px var(--accent)`.
- Error: border `--danger-fg`, helper text `--danger-fg`.
- Always 1px caret-aligned label above the input, `text-xs --fg-muted`.

### 9.3 Checkbox / Radio / Switch

- Checkbox: `14×14`, radius `4px`, border `1px --border-strong`. Checked
  fills `--accent` with `lucide check` 10px.
- Radio: same dimensions, but the inner mark is a `6×6` rounded square (not a dot).
- Switch: `28×16` track, radius `8px`, knob `12×12` radius `6px`. Off:
  `--bg-subtle`. On: `--accent`.

### 9.4 Card / Panel

- Background `--bg-elevated`, border `1px --border`, radius `12px`.
- Padding `16` (compact) / `20` (comfortable).
- Header row: `text-sm --fg-muted` label on the left, optional action
  buttons on the right, separated from body by a `1px --border-subtle`.

### 9.5 Table

- Header: `text-xs`, weight 500, color `--fg-muted`, background
  `--bg-emphasis`, sticky on scroll, bottom border `1px --border`.
- Rows: height `28`/`36`, separated by `1px --border-subtle`.
- Hover row: `background --bg-subtle`.
- Selected row: `background --accent-subtle`, left border `2px --accent`.
- Cells: text `text-sm`. Numeric, ID, and timestamp cells use
  `--font-mono`.
- Sortable column header shows a 12px lucide chevron in `--fg-subtle`.
- Empty table: a single row with `text-sm --fg-muted` copy + a primary
  action button on the right.

### 9.6 List row (used in feeds, meeting list, commitment list)

```
[ status dot ]  [ primary text ]                           [ meta mono ]
                [ secondary --fg-muted text-xs ]           [ time mono ]
```

Padding `8 16`, divided by `1px --border-subtle`. Hover background
`--bg-subtle`. No radius.

### 9.7 Tabs

- Underline tabs only. No pill tabs.
- Inactive: `text-sm --fg-muted`, no border.
- Active: `text-sm --fg`, bottom `1px --accent` flush with the container.
- Container has a bottom `1px --border` that the active underline overlaps.

### 9.8 Badge / Chip / Pill

- Height `18px`, radius `4px`, padding `0 6px`, `text-xs / 500`.
- Variants:
  - **Neutral:** bg `--bg-subtle`, text `--fg`.
  - **Status (success/warning/danger/info):** bg `<state>-bg`, text
    `<state>-fg`, no border.
  - **Outline:** transparent bg, `1px --border-strong` border, text
    `--fg-muted`.
- Pills/circles are forbidden. A "status pill" in this system is a
  rectangle.

### 9.9 Tooltip

- Background `--bg-emphasis`, border `1px --border`, radius `2px`,
  padding `4 8`, `text-xs --fg`.
- Delay 300ms in. Out 100ms. Single-line preferred.

### 9.10 Modal / Dialog / Sheet

- Modal: centered, max-width `560px`, background `--bg-elevated`, border
  `1px --border`, radius `0`. Backdrop: `rgba(0,0,0,0.6)` no blur.
- Sheet (right side, used for evidence pane and brief): width `min(480px,
  40vw)`, slides in from the right at `--duration-base`.
- Close affordance: `lucide x` 16px in top-right, `--fg-muted`.

### 9.11 Toast

- Width `360px`, radius `2px`, background `--bg-elevated`, border
  `1px --border`. Left border `2px` in semantic color.
- Auto-dismiss `5s` (info/success), `8s` (warning), `12s` (danger).

### 9.12 Command palette (`⌘K`)

- Width `640px`, max-height `60vh`, background `--bg-elevated`, border
  `1px --border`, radius `2px`, `--shadow-popover`.
- Search input: borderless, `text-md`, padding `12 16`, bottom border
  `1px --border-subtle`.
- Result rows: height `36`, leading icon (16px), label `--fg`, suffix
  `text-xs --fg-muted`.
- Selected row: bg `--bg-subtle`, left border `2px --accent`.
- Footer: `text-xs --fg-muted` with kbd hints (`↑↓` navigate, `↵` select,
  `esc` close).

### 9.13 Keyboard hint (`kbd`)

- `1px --border` outline, `--bg-subtle` fill, radius `2px`, padding `0 4`,
  `text-2xs --font-mono --fg-muted`. Min width `16`.

### 9.14 Avatar

- `20`/`24`/`32px` square. Radius `2px`. Border `1px --border`.
- Initials in `text-2xs / 600`, color `--fg`, background `--bg-subtle`.
- Status dot overlay: `8×8` square at bottom-right, semantic color, with
  a `1px --bg` outline so it reads against any background.

### 9.15 Speaker chip (transcripts, overlay)

- Inline element. Height `18`. Radius `2`. Padding `0 6`.
- Format: `[●][2px gap][Name]`. The dot is `--success-fg` if confidence
  ≥0.85, `--warning-fg` if 0.6–0.85, `--fg-subtle` if <0.6.
- TEAM (current user): bg `--accent-subtle`, text `--accent`.
- TEAM (other): bg `--bg-subtle`, text `--fg`.
- EXTERNAL: outline only.
- Unidentified: outline dashed.

### 9.16 Heartbeat indicator

A `6×6` square that pulses opacity `1 → 0.4 → 1` over `1.6s`, infinite,
`--ease-in-out`. Color `--success-fg` when audio flowing; `--warning-fg`
on degraded; `--danger-fg` on disconnected.

### 9.17 Topic indicator (overlay)

Single line: `[2px gap][topic label][2px gap][· dot ·][2px gap][duration mono]`.
Topic label is `text-sm --fg`. Duration is `text-xs --font-mono --fg-muted`.
On topic shift, the new label slides in from the right (`translateX(8px → 0)`,
`--duration-base`); the previous label fades out.

### 9.18 Constraint counter

`[icon shield 14px][2px gap][N][2px gap]constraints` where `N` is mono.
Increments are flashed once: background `--accent-subtle` for `300ms`, then
back to default. No bounce, no scale.

### 9.19 Alert card (overlay)

```
┌────────────────────────────────────────────┐
│ ▌[icon] Severity · Category    [time mono] │
│ ▌                                          │
│ ▌ One-line message in --fg.                │
│ ▌                                          │
│ ▌ [ Why? ▾ ]              [ Dismiss ✕ ]    │
└────────────────────────────────────────────┘
```

- Width fills the overlay (`328px` inner with 16px gutter).
- Left rail (▌) is `2px` wide in routing color.
- Padding `12 16`. Radius `0`. Border `1px --border`. Background
  `--bg-elevated` or `--danger-bg` for critical.
- "Why?" expands inline to show:
  - The triggering utterance (mono, indented `1px --border-subtle` on the
    left).
  - Tier 4 reasoning, ≤3 lines.
  - Routing label ("Shared with Priya, Raj" or "Personal").

### 9.20 Transcript renderer

- Each utterance is a row, no card chrome:
  - Speaker chip + timestamp mono on the left.
  - Utterance text on the right, `text-base / --fg`.
- Hovered row: bg `--bg-subtle`.
- Anchor target (when navigated to from an artifact): bg `--accent-subtle`
  for `1.2s` then fades.
- Search highlights: `--warning-fg` text, no background.

### 9.21 Evidence link

Inline element used in artifact pages (e.g., `Decision` cites a transcript
range). Format: `[mono timestamp]` in `--accent`, hover underline. Click
opens the right-side evidence sheet with the transcript range pre-scrolled.

### 9.22 Charts (small, inline only)

- Single-color charts using `--fg-muted` for series, `--accent` for the
  primary series.
- 1px stroke for lines, 1px gridlines in `--border-subtle`, axis labels
  `text-xs --fg-subtle` mono.
- No legends if the chart has only one series.

---

## 10. Layout Anatomy

### 10.1 Web app shell

```
┌────────────────────────────────────────────────────────────────┐
│ Top bar (48px)                                                 │
│ ┌──────┐  Client switcher          ⌘K   ⌘J        avatar      │
│ │ logo │                                                       │
│ └──────┘                                                       │
├──────┬─────────────────────────────────────────────────────────┤
│      │                                                         │
│ Left │  Content                                                │
│ rail │  ─────                                                  │
│ 220px│                                                         │
│      │                                                         │
└──────┴─────────────────────────────────────────────────────────┘
```

- Top bar: `48px`, bottom border `1px --border`. Background `--bg`.
- Left rail: `220px`, right border `1px --border`. Background `--bg`.
  Items: `28px` rows, `text-sm`, leading icon 14px. Active item: bg
  `--bg-subtle`, left border `2px --accent`.

### 10.2 Desktop main window

Same primitives as the web app shell, but:

- The left rail is shorter (`180px`) because the desktop app has fewer
  domains.
- The top bar is `40px`.
- A persistent footer health strip (`24px`, `text-xs`) shows server +
  audio + sync state.

### 10.3 Live overlay window

```
┌─────────────────────────────┐ 360px
│ ░ ambient strip (40px)      │
├─────────────────────────────┤
│                             │
│ alert region (auto)         │
│                             │
├─────────────────────────────┤
│ footer controls (32px)      │
└─────────────────────────────┘
```

- Window background `--surface-overlay` (10% transparent black).
- Always-on-top, draggable by the ambient strip, double-click to expand.
- Shadow: `--shadow-popover`. This is the only window where shadow is used
  as separation.
- Frame chrome: native frameless on macOS/Windows; on Linux a 1px
  `--border` is drawn manually.

---

## 11. Accessibility & Contrast

- All `--fg` against `--bg`: contrast ≥ `15:1`.
- All `--fg-muted` against `--bg`: contrast ≥ `5.7:1`.
- All semantic `-fg` colors against their `-bg` washes: contrast ≥ `4.5:1`.
- Focus ring is mandatory and identical across components (1px accent
  outer ring with 1px gap to background).
- Every interactive element has a visible focus state and a label readable
  by screen readers.
- Hit targets ≥ `28×28`, even when the visual is smaller (use padding).
- All status communicated by color is also communicated by a glyph or
  text label.

---

## 12. Tailwind / Token Mapping

```css
:root {
  --bg: #000;
  --bg-elevated: #0A0A0A;
  --bg-subtle: #111;
  --bg-emphasis: #171717;
  --surface-overlay: #0E0E0EE6;

  --border: #262626;
  --border-strong: #3A3A3A;
  --border-subtle: #1A1A1A;

  --fg: #EDEDED;
  --fg-muted: #A1A1A1;
  --fg-subtle: #6B6B6B;
  --fg-on-accent: #0A0A0A;

  --accent: #7C5CFF;
  --accent-hover: #8E73FF;
  --accent-pressed: #6A4DE8;
  --accent-subtle: #7C5CFF1A;
  --accent-fg: #FFFFFF;

  --success-fg: #3FB950; --success-bg: #3FB9501A;
  --warning-fg: #D29922; --warning-bg: #D299221A;
  --danger-fg:  #F85149; --danger-bg:  #F851491A;
  --info-fg:    #58A6FF; --info-bg:    #58A6FF1A;

  --radius-0: 0px;
  --radius-1: 2px;

  --duration-fast: 100ms;
  --duration-base: 150ms;
  --duration-slow: 200ms;

  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  --shadow-popover:
    0 0 0 1px var(--border),
    0 8px 24px rgba(0, 0, 0, 0.6);

  --font-sans: "Geist", "Inter", system-ui, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-feature-settings: "tnum" 1, "ss01" 1, "ss03" 1;
}
```

Tailwind extension (illustrative, not exhaustive):

```ts
theme: {
  extend: {
    colors: {
      bg: "var(--bg)",
      "bg-elevated": "var(--bg-elevated)",
      "bg-subtle": "var(--bg-subtle)",
      "bg-emphasis": "var(--bg-emphasis)",
      border: "var(--border)",
      "border-strong": "var(--border-strong)",
      "border-subtle": "var(--border-subtle)",
      fg: "var(--fg)",
      "fg-muted": "var(--fg-muted)",
      "fg-subtle": "var(--fg-subtle)",
      accent: "var(--accent)",
      "accent-subtle": "var(--accent-subtle)",
      success: "var(--success-fg)",
      warning: "var(--warning-fg)",
      danger: "var(--danger-fg)",
      info: "var(--info-fg)",
    },
    borderRadius: { none: "0", sm: "2px" },
    fontFamily: {
      sans: ["var(--font-sans)"],
      mono: ["var(--font-mono)"],
    },
  },
}
```

---

## 13. Do / Don't

**Do**

- Use 1px hairline borders to separate everything.
- Keep accent usage to ≤5% of pixels in any view.
- Use mono for any value the user might compare against another value.
- Show empty states with one icon + one line + one action.
- Treat the live overlay as the single most opinionated surface in the
  product — it cannot afford visual noise.

**Don't**

- Don't use rounded chips or pills. Status is a 2px rectangle.
- Don't use shadow as a separator on cards or panels.
- Don't use color to decorate; only to indicate state.
- Don't introduce a second accent. If you need a second emphasis, use
  weight + background, not hue.
- Don't animate route transitions or page mounts.
- Don't nest cards inside cards. Use dividers.

---

*Last updated: April 2026*
