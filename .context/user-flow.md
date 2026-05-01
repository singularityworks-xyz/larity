# LARITY — USER FLOW & PAGE INVENTORY

> Source of truth for *what each surface contains*. Pairs with `architecture-and-flow.md`
> (system behavior) and `ui-spec.md` (visual system).

Larity has **two distinct frontends**. They share an auth boundary, an org/client
scope, and a design system, but their jobs are different.

| Surface | Tech | Job |
|---|---|---|
| **Desktop App** (`apps/desktop`) | Tauri + React | Host dual-channel audio capture, live overlay, ambient awareness, in-meeting alerts, voice-first assistant. Used *during* and *around* meetings. |
| **Control Web App** (`apps/control` web shell) | React + Vite | Review, search, admin, integrations, knowledge surfaces, audit. Never captures audio. Used *outside* meetings. |

Both surfaces speak to the same shared remote server (Elysia REST + uWS WebSocket).

---

## 0. Global Conventions

### Auth boundary
- Single `better-auth` session shared across desktop + web.
- Org → Client → User scoping is enforced server-side; every page is **client-aware**: a global client switcher in the top bar persists scope across navigation.
- An "All clients" scope exists for org-wide views (Decisions feed, Audit, Settings).

### Navigation primitives (shared)
- **Top bar:** logo, client switcher, command palette trigger (`⌘K`), assistant trigger (`⌘J`), user menu.
- **Left rail (web only):** primary navigation by domain (Meetings, Decisions, Commitments, Tasks, Knowledge, Settings).
- **Tray + overlay (desktop only):** persistent system-tray icon; in-meeting overlay window pinned over the conferencing app.

### Empty / loading / error states (every page)
- **Empty:** one-line copy + a single primary action. No illustrations.
- **Loading:** skeleton blocks matching final layout. No spinners on full pages.
- **Error:** one-line cause, "Retry" + "Copy diagnostic ID" actions.

---

## 1. DESKTOP APP

The desktop app has **five window types**:

1. Tray menu (always available)
2. Main window (dashboard, prep, review, assistant, settings)
3. Pre-meeting brief sheet
4. Live meeting overlay (always-on-top, click-through optional)
5. Notifications (native OS toasts via Tauri notifications plugin)

### 1.1 Auth & First Run

#### `/welcome`
- Product mark + one-line tagline ("Work, with memory.").
- Two primary actions: **Sign in**, **Create account**.
- Below the fold: "What Larity needs" — list of OS permissions it will request (microphone, system audio loopback / screen capture on supported OSes, calendar OAuth, notifications). Plain English. No marketing.

#### `/auth/sign-in`, `/auth/sign-up`
- Email + password, Google SSO, Microsoft SSO.
- Sign-up collects: full name, org name (or invite code), role.
- Post sign-up → `/onboarding`.

#### `/onboarding` (3 steps, single window, progress dots)
1. **Permissions check:** request mic + system audio loopback / screen capture + notifications. Show real status per permission. Block "Continue" until the machine can either host dual-channel capture or explicitly run as participant-only.
2. **Calendar connect:** Google / Microsoft / "Skip for now". On connect, list next 7 days of meetings as a preview.
3. **Voice baseline:** 10-second mic check (used only for local VAD calibration — *not* a voice profile, no audio leaves device). Plain copy: *"This calibrates your microphone. We do not store voice samples."*

End state: lands on `/home` with a "First meeting" hint card.

### 1.2 Idle / Home

#### `/home` (main desktop window default route)
- **Top:** "Next meeting in 12 min — Acme weekly sync" card with **Open brief**, **Start meeting mode**, **Mute auto-prompt** actions.
- **Today panel:** chronological list of today's meetings (time, client, attendees, brief status: *prepped / not prepped*).
- **Recent activity:** last 5 meetings with key metrics (duration, alerts surfaced, commitments captured, decisions extracted). Each row links to `/meetings/:id`.
- **Open commitments preview:** 3 most recent commitments where you are the owner; "View all" → web Commitments view.
- **Health strip (footer):** server connection status, audio device status, last sync timestamp.

#### Tray menu (always present)
- Active state pill: `Idle` / `Listening (Acme call)` / `Reconnecting`.
- Quick actions: **Start meeting mode**, **Open overlay**, **Open assistant**, **Settings**, **Quit**.

### 1.3 Pre-Meeting Brief

#### `/meetings/:id/brief`
A single scrollable sheet, not a multi-tab page. Order is fixed; each section is collapsible but starts expanded.

1. **Header:** client name, meeting title, time, attendees (TEAM with avatars, EXTERNAL with org affiliation when known).
2. **What this meeting is about:** 2–3 sentence brief, generated pre-meeting, marked as *AI-drafted*.
3. **Open from last time:** unresolved questions, decisions still pending, tasks owed by your team or by the client. Each item links to its source meeting.
4. **Active commitments with this client:** timeline / scope / price commitments that are still in flight. Hover/tap shows source utterance.
5. **Known constraints:** policies, blocklists, NDA terms, approved terminology, pricing floors. *These are the things Larity will alert on if violated live.*
6. **Per-attendee talking points:** one collapsible block per TEAM attendee with role-specific objectives + risks.
7. **Agenda items:** parsed from calendar invite. These become the basis of "undiscussed agenda" alerts at meeting end.
8. **Footer actions:** **Start meeting mode**, **Edit brief**, **Print** (export to PDF).

### 1.4 Live Meeting Mode

This is two surfaces operating simultaneously: a small **overlay** pinned over the user's conferencing app, and an optional **expanded panel** in the main window.

#### Overlay (always-on-top, ~360px wide, draggable)
Three zones, top to bottom:

1. **Ambient strip (always visible):**
   - Heartbeat dot (audio is being processed).
   - Current topic label.
   - Constraint counter.
   - Speaker indicator (who is currently talking, TEAM/EXTERNAL badge).
   - Connected teammates avatars (collapsed to "+N" beyond 4).
   - Mic state (your VAD signal: speaking / silent).

2. **Alert region:**
   - Max 2 visible alerts, queued otherwise.
   - Each alert: severity dot, one-line message, *"Why?"* affordance (expands to show the utterance evidence + Tier 4 reasoning), dismiss.
   - Shared alerts vs personal alerts have a clearly different left border treatment (see `ui-spec.md`).

3. **Footer controls:** end meeting, mute alerts (10 min), expand to panel, "Remember this" button.

#### `/meeting/live` (expanded panel)
Used when the user wants more context without leaving the meeting. Adds to the overlay:
- **Live transcript stream** with speaker chips (current user highlighted). Toggle: *full text / commitments only*.
- **Commitment ledger view:** every classified commitment in this meeting, status (tentative / confirmed / contradicted / superseded), source utterance.
- **Topics timeline:** horizontal track of topic shifts since the meeting started, click to jump in transcript.
- **Participant list:** TEAM / EXTERNAL split, identification confidence per speaker, ability to manually correct a misidentified speaker.
- **Notes scratchpad** (local, never leaves device until saved).

### 1.5 Post-Meeting Review

#### `/meetings/:id` (desktop view of the same canonical meeting record)
- **Header:** title, client, duration, attendees, status (`PROCESSING` → `READY`).
- **Summary block:** AI-generated executive summary, marked as draft until confirmed.
- **Extracted artifacts** (each is a tabbed list, all client-scoped):
  - **Decisions** — versioned, with evidence utterances.
  - **Commitments** — final ledger, status per item, who/when/what.
  - **Tasks** — owner, deadline, priority, source decision.
  - **Open questions.**
  - **Important points** — constraints, insights, warnings, risks, opportunities.
- **Alerts surfaced during the call:** chronological log with severity, category, the utterance that triggered them, whether they were dismissed.
- **Transcript:** full text with speaker attribution, search, jump-to-utterance from any artifact.
- **Actions:** **Confirm extractions** (writes to org memory; before this, items are draft), **Reject all and re-run extraction**, **Export** (Markdown / PDF / JSON).

### 1.6 Assistant (voice-first)

#### `/assistant` (also openable as floating window with `⌘J`)
- **Conversation thread** with mixed voice + text turns.
- **Push-to-talk button** (hold space) and a text input as fallback.
- **Citations strip** under each assistant answer: every factual claim links to its source (decision id, meeting id, commitment id). No citation ⇒ no claim.
- **Quick actions** (chips): *Set reminder*, *What did we decide about X?*, *Who owns Y?*, *Show this client's open commitments*.
- **"Remember this" mode:** explicit toggle that turns the next user input into a structured memory write, with a preview + confirm step before the system writes.

### 1.7 Settings (desktop)

#### `/settings`
Single window, left sub-nav.

- **Profile:** name, avatar, email, default working hours.
- **Audio:** input/output devices, host mic source, loopback source (auto / pick monitor), single-channel fallback status, VAD sensitivity.
- **Privacy:** what is sent to the server (dual-channel PCM frames for hosts, VAD timestamps for participants, classification metadata). Toggle: *opt out of telemetry*.
- **Integrations:** Google Calendar, Microsoft Calendar, Gmail, Outlook, GitHub. Per integration: connect, disconnect, scopes, last sync.
- **Notifications:** which alert categories are surfaced as OS toasts when the overlay is hidden.
- **Hotkeys:** assistant, start meeting mode, mute alerts, "remember this".
- **Appearance:** *theme is dark only* — no light mode in v1 (lock the toggle, label "Light mode coming later"). Density: comfortable / compact.
- **About / diagnostics:** version, server endpoint, copy diagnostic bundle.

---

## 2. CONTROL WEB APP

The web app is the **review and admin surface**. It assumes you are *not* in a meeting. Layout is a left rail + content area.

### 2.1 Auth

#### `/login`, `/signup`, `/accept-invite/:token`
- Same primitives as desktop (email/password, Google, Microsoft).
- Invite acceptance auto-binds the new user to an Org and one or more Clients with a default role.

### 2.2 Home

#### `/` (Org dashboard, scoped to current client switcher)
- **This week:** meetings count, decisions extracted, commitments captured, alerts surfaced.
- **Open commitments timeline:** mini-chart showing commitments due in the next 14 days, by status.
- **Recently changed decisions:** anything superseded or revoked in the last 7 days.
- **Inbox:** items requiring user attention (extractions awaiting confirmation, contradictions detected, calendar conflicts).

### 2.3 Clients

#### `/clients`
- Table: name, status (ACTIVE/INACTIVE/ARCHIVED), members, last meeting, open commitments, open tasks.
- Bulk actions: archive, change owner.

#### `/clients/:clientId`
A client home page. Tabs:
1. **Overview:** profile (name, contact, primary contacts), recent activity, KPIs.
2. **Meetings:** filterable list (status, date range, attendee).
3. **Decisions:** active vs superseded vs revoked, version history per decision.
4. **Commitments:** filter by status / type (timeline, scope, price, capability, etc.). Each row links to source utterance.
5. **Tasks:** kanban (OPEN / IN_PROGRESS / BLOCKED / DONE / CANCELLED) + list view toggle.
6. **Open questions.**
7. **Important points** (constraints / insights / warnings / risks / opportunities, faceted).
8. **Documents** (notes, contracts, proposals, SOWs).
9. **Policy guardrails** scoped to this client (NDA, legal, terminology, custom).
10. **Members:** users assigned via `ClientMember` with role (LEAD / MEMBER / OBSERVER).

### 2.4 Meetings

#### `/meetings`
- Faceted list: client, status, date range, attendee, has-alerts.
- Each row: title, client, time, duration, alerts surfaced, commitments captured, status pill.

#### `/meetings/:id`
Mirrors the desktop post-meeting view but optimized for review:
- Sticky header (title, client, time, status, **Confirm extractions** button while draft).
- Three-column layout:
  - **Left:** transcript with speaker chips, search, jump anchors.
  - **Center:** extraction tabs (Decisions / Commitments / Tasks / Open questions / Important points / Alerts).
  - **Right:** evidence pane — when an artifact is selected, the underlying utterance(s) are highlighted in the transcript and shown here with timestamps.
- **Diff view** (when re-extraction has been run): shows what changed vs the prior extraction.

### 2.5 Decisions

#### `/decisions`
- Org-wide or client-scoped feed of versioned decisions.
- Filters: status (ACTIVE / SUPERSEDED / REVOKED), client, date, owner, has-contradictions.

#### `/decisions/:id`
- Decision text, status, version history (timeline).
- Evidence: source meeting + utterance(s).
- Linked tasks, linked commitments, related decisions.
- Actions: **Supersede** (creates new version), **Revoke** (with required reason), **Export evidence chain**.

### 2.6 Commitments

#### `/commitments`
- Same shape as decisions: versioned, with status (TENTATIVE / CONFIRMED / CONTRADICTED / SUPERSEDED) and type chips.
- Special filter: **Contradicted** — items where Larity flagged a live contradiction.

#### `/commitments/:id`
- Commitment text, type, status, owner.
- Source utterance with surrounding 30s of transcript.
- "Contradicts" / "Superseded by" graph (small node-edge view, not a full graph viz).
- Linked tasks, linked decisions.

### 2.7 Tasks

#### `/tasks`
- Cross-client task view.
- Two layouts: kanban (default for OPEN/IN_PROGRESS/BLOCKED/DONE/CANCELLED) and list (sortable).
- Filters: priority, owner, client, deadline window, source (meeting vs manual).

#### `/tasks/:id`
- Task detail, owner, priority, deadline, source decision.
- Activity log (status changes).
- Linked meetings.

### 2.8 Open Questions

#### `/open-questions`
- Feed of unresolved items per meeting, faceted by client and age.
- Each row: question text, surfaced-in meeting, age, suggested next meeting, **Mark resolved** action (which prompts for evidence link).

### 2.9 Knowledge

This is the assistant surface on the web side and the search surface across all org memory.

#### `/knowledge` (split layout)
- **Left:** assistant thread (text-first; voice optional via mic icon).
- **Right:** results pane — when the assistant cites sources, those documents/decisions/commitments/important points render here as cards.
- **Above the fold:** suggested queries scoped to the current client (*"What did we commit to in the last 30 days?"*, *"Open questions older than 2 weeks."*).

#### `/knowledge/search?q=...`
- Standalone full-text + semantic search across decisions, commitments, important points, policy guardrails, transcripts.
- Result types are clearly labeled with type pills; each result shows source and timestamp.
- Filters: type, client, date range, status.

### 2.10 Policy Guardrails

#### `/policies`
- Two scopes: **Org-wide** and **Per client** (tab toggle).
- List grouped by `GuardrailRuleType`: NDA, LEGAL, TERMINOLOGY, INTERNAL, CUSTOM.

#### `/policies/:id`
- Rule text, scope (org or client), type, active toggle.
- Examples that would trigger this rule (auto-generated from past matches).
- History of violations detected.

### 2.11 Team & Org

#### `/team`
- Members table: name, role (OWNER/ADMIN/MEMBER), client assignments, last active.
- Invite via email; role + initial client list set at invite time.

#### `/team/:userId`
- User profile, client assignments, recent meeting activity, alert preferences.

#### `/org/settings`
- Org name, logo, default timezone.
- Billing (stub in v1).
- Data retention controls per data type (transcripts, audio metadata, alerts).
- Export org data.

### 2.12 Integrations

#### `/integrations`
- Cards per integration (Google Calendar, Microsoft Calendar, Gmail, Outlook, GitHub).
- Per card: status, scopes, last sync, **Reconnect** / **Disconnect**, link to integration-specific config.

#### `/integrations/github`
- Connected repos, indexing status (commits, PRs, issues).
- Repo → client mapping (which repos belong to which client).

### 2.13 Audit

#### `/audit`
- Append-only log of memory writes (decisions created/superseded/revoked, commitments updated, tasks status changed, policies edited, integrations connected).
- Filters: actor (user / AI extraction job), object type, client, date range.
- Each row expands to show diff + evidence link.

### 2.14 Profile / Account

#### `/account`
- Personal settings (name, avatar, email, password change, MFA).
- Sessions (devices currently signed in, revoke).
- Notification preferences (email digest, in-app inbox).

---

## 3. CROSS-SURFACE FLOWS

Three flows that span both surfaces. Worth being explicit about.

### 3.1 Meeting lifecycle (T-15 → T+24h)

```
[Web] /clients/:id/meetings  ──schedule──►  Calendar event
                                              │
                                              ▼
[Desktop] tray prompt at T-15  ──open──►  /meetings/:id/brief  (desktop)
                                              │
                                              ├──Start meeting mode──►  Live overlay
                                              │                           │
                                              │                           │ (alerts, ambient, ledger)
                                              │                           ▼
                                              │                         End meeting
                                              │                           │
                                              │                           ▼
                                              │                  Async extraction (RabbitMQ)
                                              ▼                           │
[Desktop or Web] /meetings/:id  ◄──draft────────────────────────────────┘
                       │
                       └──Confirm extractions──►  Org memory writes (decisions, commitments, tasks, ...)
                                                    │
                                                    ▼
                                                  Searchable in /knowledge for all future meetings
```

### 3.2 Commitment contradiction surfacing

A commitment captured in meeting A, contradicted in meeting B 3 weeks later.

```
Meeting A ──extract──► Commitment (CONFIRMED, embedded in pgvector)
                           │
                           ▼
                       Stored as org memory
                           │
                           ▼
Meeting B (live)  ──Tier 3 search hits this commitment──►  Tier 4 alert
                           │                                  │
                           ▼                                  ▼
                Live overlay shows:                    Alert routed:
                "X said timeline is 2 weeks; in       - shared (team sees)
                meeting A you committed to 3."        - personal-to-speaker (own utterance)
                           │
                           ▼
              Post-meeting: Commitment.status = CONTRADICTED, with link back to Meeting A
```

### 3.3 Explicit "Remember this"

```
User says "Remember this"           User clicks "Remember this" in overlay
        │                                       │
        └───────────────┬───────────────────────┘
                        ▼
            Larity captures last 30s window
                        │
                        ▼
            LLM structures content (schema-bound)
                        │
                        ▼
            Confirmation modal in desktop:
            "Save this as: [type] [text]?"
                        │
                ┌───────┴────────┐
                ▼                ▼
              Save            Discard
                │
                ▼
        System writes to DB + pgvector
                │
                ▼
        Visible in /knowledge and /audit
```

---

## 4. WHAT IS *NOT* IN V1

To keep the page inventory honest:

- No light mode.
- No mobile app.
- No browser extension. There will never be one.
- No public sharing / external client portals.
- No multi-org switching for a single user (one user → one org in v1).
- No graph visualization of the knowledge graph beyond small node-edge views in the commitment detail page.
- No multi-layer summaries (executive / manager / engineer) yet — single summary per meeting.
- No workload / capacity / timeline prediction surfaces yet.

---

*Last updated: April 2026*
