# Larity Live Meeting Mode UI Specification

This document outlines the UI structure, components, and user flow for Larity's Live Meeting Mode, based on the specifications in `.context/user-flow.md`.

The Live Meeting Mode operates in two concurrent UI surfaces: a **compact overlay** (pinned over the conferencing app) and an **expanded panel** (accessible within the main desktop window).

---

## 1. The Overlay (Compact View)

The overlay is an always-on-top, draggable window (~360px wide). It is designed to be peripheral, providing high-value ambient context and critical alerts without dominating the user's screen.

### 1.1 Ambient Strip (Top Zone)
Always visible to provide real-time status and context.
- **Heartbeat Dot:** A subtle pulsing indicator confirming audio is being processed.
- **Current Topic Label:** Dynamic text indicating the active topic of conversation.
- **Constraint Counter:** A numeric badge showing active constraints/guardrails for this specific client.
- **Speaker Indicator:** Shows who is currently talking, adorned with a `TEAM` or `EXTERNAL` badge for quick identification.
- **Connected Teammates:** Avatars of colleagues also using Larity on the call (collapses to `+N` beyond 4).
- **Mic State:** Visual representation of the user's local Voice Activity Detection (VAD) signal (speaking vs. silent).

### 1.2 Alert Region (Middle Zone)
Surfaces critical live insights (Tier 4 reasoning).
- **Capacity:** Maximum of 2 visible alerts at any time. Additional alerts are queued.
- **Alert Anatomy:**
  - Severity dot (color-coded).
  - One-line summary message (e.g., "Contradicts previous timeline commitment").
  - *"Why?"* affordance: Expands the alert to reveal the specific utterance evidence and the AI's reasoning.
  - Dismiss button.
- **Styling:** Shared alerts (visible to the whole team) have a distinct left border treatment compared to personal alerts.

### 1.3 Footer Controls (Bottom Zone)
Actionable toggles and lifecycle controls.
- **End Meeting:** Terminates the live capture and transitions to the extraction phase.
- **Mute Alerts:** Temporarily suppresses alerts (e.g., "Mute for 10 min").
- **Expand to Panel:** Opens the `/meeting/live` expanded view in the main desktop window.
- **"Remember this":** Explicit manual trigger to capture the last 30 seconds of conversation as structured memory.

---

## 2. The Expanded Panel (`/meeting/live`)

This is the main application window's UI during an active meeting. While the overlay sits on top of Zoom/Teams, the expanded panel is for users who want to actively engage with Larity's real-time processing, take notes, or review the transcript live.

### 2.1 Layout Structure (Desktop Main Window)
- **Header (Sticky):** 
  - Client Name & Meeting Title.
  - Live duration timer and pulsing recording/listening indicator.
  - Global Actions: "End Meeting", "Mute Alerts", "Remember this".
- **Top Track: Topics Timeline**
  - A horizontal chronological track spanning the top just below the header. It maps topic shifts since the meeting started. Clicking a topic jumps the transcript to that point.
- **Main Content Area (Two-Column Layout):**
  - **Left Column: Live Transcript Stream**
    - Auto-scrolling text with speaker chips (highlighting the current user). 
    - Quick Toggle: Switch between *Full Text* and *Commitments Only*.
    - Visual indicators in the margin for when alerts or explicit memories ("Remember this") were triggered.
  - **Right Sidebar (Tabbed or Stacked):**
    - **Participant List:** Split by `TEAM` and `EXTERNAL`. Shows identification confidence per speaker and provides a UI to manually correct misidentified speakers on the fly.
    - **Commitment Ledger:** A real-time running list of every classified commitment in the current meeting. Shows status (tentative, confirmed, contradicted, superseded) and links to the source utterance.
    - **Notes Scratchpad:** A localized text area for personal notes. Content remains entirely on-device until explicitly saved or the meeting ends.

---

## 3. User Flow: Starting & Running a Session

### 3.1 Pre-Session & Start
1. **Scheduled Start:** The user sees the upcoming meeting on the Desktop `/home` screen (synced from calendar) or the pre-meeting brief (`/meetings/:id/brief`).
2. **Ad-Hoc Start:** The user triggers "Start meeting mode" from the Desktop Tray menu or command palette, then selects the Client it belongs to.
3. **Initialization:** User clicks **Start meeting mode**. Larity checks/requests mic and system audio loopback permissions.
4. **Launch:** The Live Overlay appears over the user's screen, and the Desktop Main Window transitions to `/meeting/live`.

### 3.2 Live State (During the Meeting)
- **Passive:** User views the Ambient Strip as topics shift and speakers change.
- **Alert Trigger:** A constraint is violated or a contradiction is detected. An alert slides into the Alert Region.
- **Investigation:** User clicks *"Why?"* on the alert to view the transcript snippet and reasoning, then dismisses it.
- **Manual Capture:** User hears something important and clicks *"Remember this"* to explicitly instruct Larity to structure the last 30 seconds of audio.
- **Deep Dive:** User needs to review exactly what was said 5 minutes ago. They click *Expand to Panel*, jump to the topic in the Topics Timeline, and read the Live Transcript Stream.

### 3.3 Termination (Exiting Meet Mode)
- **Action:** User clicks *End Meeting* in the overlay footer.
- **Transition:** The overlay closes. The desktop app shifts to the post-meeting review view (`/meetings/:id`) while the backend asynchronously processes the final extraction (generating the summary, finalized decisions, tasks, etc.).
- **Confirmation:** The user reviews the draft extractions in the main window and clicks *Confirm extractions* to commit them to the organization's memory graph.