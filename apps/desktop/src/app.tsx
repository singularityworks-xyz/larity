import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  type AudioFrameEvent,
  type AudioStatusSnapshot,
  AudioStreamingClient,
} from "./services/audio-streaming";
import {
  findCalendarPrompt,
  formatMeetingCountdown,
  getMockCalendarMeetings,
  type MeetingPrompt,
  type ScheduledMeeting,
} from "./services/meeting-detection";

const LOOKAHEAD_MS = 5 * 60_000;
const CALENDAR_POLL_INTERVAL_MS = 10_000;
const DEFAULT_SESSION_ID = `desktop-session-${Date.now()}`;

interface HeuristicHint {
  title: string;
  context: string;
}

function App() {
  const streamingClientRef = useRef(
    new AudioStreamingClient({ wsBaseUrl: import.meta.env.VITE_WS_URL })
  );
  const promptedMeetingIdsRef = useRef(new Set<string>());

  const [status, setStatus] = useState<AudioStatusSnapshot | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [framesDropped, setFramesDropped] = useState(0);
  const [lastTs, setLastTs] = useState<number>(0);
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION_ID);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>(() =>
    getMockCalendarMeetings()
  );
  const [prompt, setPrompt] = useState<MeetingPrompt | null>(null);
  const [streamWarning, setStreamWarning] = useState("");
  const [heuristicEnabled, setHeuristicEnabled] = useState(false);

  const promptCountdown = useMemo(() => {
    if (!prompt) {
      return "";
    }

    return formatMeetingCountdown(prompt.startTimeMs);
  }, [prompt]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const nextStatus = await invoke<AudioStatusSnapshot>(
        "audio_capture_status"
      );
      setStatus(nextStatus);
    } catch (error) {
      setStreamWarning(`Unable to read capture status: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    refreshStatus().catch((error) => {
      setStreamWarning(`Unable to read capture status: ${String(error)}`);
    });

    const unlistenPromise = listen<AudioFrameEvent>("audio-frame", (event) => {
      setFramesReceived((previous) => previous + 1);
      setLastTs(event.payload.ts);

      const result = streamingClientRef.current.handleAudioFrame(event);
      const metrics = streamingClientRef.current.getMetrics();
      setFramesSent(metrics.framesSent);
      setFramesDropped(metrics.framesDropped);

      if (result.dropped) {
        setStreamWarning(streamingClientRef.current.getWarning());
      } else if (result.sent) {
        setStreamWarning(streamingClientRef.current.getWarning());
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => {
        unlisten();
      });
      streamingClientRef.current.disconnect();
    };
  }, [refreshStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const runDetection = async (): Promise<void> => {
        const nowMs = Date.now();
        const calendarPrompt = findCalendarPrompt({
          meetings,
          nowMs,
          lookaheadMs: LOOKAHEAD_MS,
          promptedMeetingIds: promptedMeetingIdsRef.current,
        });

        if (calendarPrompt) {
          promptedMeetingIdsRef.current.add(calendarPrompt.id);
          setPrompt(calendarPrompt);
          return;
        }

        if (!heuristicEnabled || prompt) {
          return;
        }

        try {
          const heuristicHint = await invoke<HeuristicHint | null>(
            "meeting_detection_check_heuristic"
          );

          if (!heuristicHint) {
            return;
          }

          setPrompt({
            id: `heuristic-${nowMs}`,
            title: heuristicHint.title,
            startTimeMs: nowMs,
            source: "heuristic",
            context: heuristicHint.context,
          });
        } catch (error) {
          setStreamWarning(`Heuristic detection unavailable: ${String(error)}`);
        }
      };

      runDetection().catch((error) => {
        setStreamWarning(`Meeting detection failure: ${String(error)}`);
      });
    }, CALENDAR_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [heuristicEnabled, meetings, prompt]);

  async function startCaptureWithSession(nextSessionId: string): Promise<void> {
    try {
      streamingClientRef.current.connect(nextSessionId);
      await invoke("audio_capture_start", { sessionId: nextSessionId });
      setSessionId(nextSessionId);
      await refreshStatus();
    } catch (error) {
      setStreamWarning(`Failed to start capture: ${String(error)}`);
      streamingClientRef.current.disconnect();
    }
  }

  async function startCaptureManual(): Promise<void> {
    await startCaptureWithSession(sessionId);
  }

  async function stopCapture(): Promise<void> {
    try {
      await invoke("audio_capture_stop");
      streamingClientRef.current.disconnect();
      await refreshStatus();
    } catch (error) {
      setStreamWarning(`Failed to stop capture: ${String(error)}`);
    }
  }

  async function startPromptedMeeting(): Promise<void> {
    if (!prompt) {
      return;
    }

    const nextSessionId = `meeting-${prompt.id}-${Date.now()}`;
    await startCaptureWithSession(nextSessionId);
    setPrompt(null);
  }

  function dismissPrompt(): void {
    setPrompt(null);
  }

  function regenerateMockMeetings(): void {
    setMeetings(getMockCalendarMeetings());
  }

  return (
    <main className="desktop-shell">
      <header className="hero-card">
        <p className="eyebrow">Day 14</p>
        <h1>Larity Meeting Mode</h1>
        <p className="hero-subtitle">
          Desktop capture prompt, system-audio streaming, and realtime session
          wiring.
        </p>
      </header>

      <section className="panel">
        <h2>Capture Controls</h2>
        <div className="control-row">
          <button
            disabled={status?.active}
            onClick={startCaptureManual}
            type="button"
          >
            Manual Start (Tray/Overlay equivalent)
          </button>
          <button
            disabled={!status?.active}
            onClick={stopCapture}
            type="button"
          >
            Stop Capture
          </button>
        </div>

        <div className="toggle-row">
          <label htmlFor="heuristic-toggle">
            <input
              checked={heuristicEnabled}
              id="heuristic-toggle"
              onChange={(event) => {
                setHeuristicEnabled(event.target.checked);
                if (!event.target.checked && prompt?.source === "heuristic") {
                  setPrompt(null);
                }
              }}
              type="checkbox"
            />
            Enable optional process/audio heuristic prompts
          </label>
        </div>

        <div className="session-id-row">
          <label htmlFor="session-id-input">Session ID</label>
          <input
            disabled={status?.active}
            id="session-id-input"
            onChange={(event) => setSessionId(event.target.value)}
            value={sessionId}
          />
        </div>
      </section>

      <section className="panel stats-grid">
        <div>
          <h3>Status</h3>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>
        <div>
          <h3>Streaming</h3>
          <p>Frames received from Rust: {framesReceived}</p>
          <p>Frames sent to realtime: {framesSent}</p>
          <p>Frames dropped by backpressure: {framesDropped}</p>
          <p>Last frame timestamp: {lastTs || "none"}</p>
        </div>
      </section>

      {streamWarning ? (
        <section aria-live="polite" className="warning-banner">
          {streamWarning}
        </section>
      ) : null}

      <section className="panel">
        <div className="meetings-header">
          <h2>Calendar Trigger (Mock)</h2>
          <button onClick={regenerateMockMeetings} type="button">
            Refresh Mock Meetings
          </button>
        </div>
        <ul className="meeting-list">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <strong>{meeting.title}</strong>
              <span>{formatMeetingCountdown(meeting.startTimeMs)}</span>
            </li>
          ))}
        </ul>
      </section>

      {prompt ? (
        <section aria-modal="true" className="overlay-prompt" role="dialog">
          <div className="prompt-card">
            <p className="eyebrow">
              {prompt.source === "calendar"
                ? "Calendar Trigger"
                : "Heuristic Trigger (Optional)"}
            </p>
            <h2>Start Meeting Mode for {prompt.title}?</h2>
            <p>
              {prompt.source === "calendar"
                ? promptCountdown
                : (prompt.context ?? "Possible meeting activity detected.")}
            </p>
            <div className="control-row">
              <button onClick={startPromptedMeeting} type="button">
                Start Meeting Mode
              </button>
              <button onClick={dismissPrompt} type="button">
                Not now
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default App;
