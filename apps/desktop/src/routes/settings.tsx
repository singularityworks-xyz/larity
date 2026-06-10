import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { VadManager } from "../services/vad";

type CorrelationState = "TEAM MEMBER" | "EXTERNAL";
type VadDebugEventType = "speech_start" | "speech_end";

interface VadDebugEvent {
  id: string;
  type: VadDebugEventType;
  ts: number;
}

const TEAM_MEMBER_STATE: CorrelationState = "TEAM MEMBER";
const EXTERNAL_STATE: CorrelationState = "EXTERNAL";
const SPEECH_ACTIVE_MS = 2500;

function formatTimestamp(ts: number | null): string {
  if (!ts) {
    return "Never";
  }
  return new Date(ts).toLocaleTimeString();
}

export function SettingsPage() {
  const vadManager = useMemo(() => new VadManager(), []);
  const [isRunning, setIsRunning] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [lastSpeechStartTs, setLastSpeechStartTs] = useState<number | null>(
    null
  );
  const [lastSpeechEndTs, setLastSpeechEndTs] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [events, setEvents] = useState<VadDebugEvent[]>([]);
  const [warning, setWarning] = useState("");
  const [permissionDecision, setPermissionDecision] = useState("loading");
  const [audioDeviceCount, setAudioDeviceCount] = useState<number | null>(null);
  const [lastPreflightError, setLastPreflightError] = useState<string>("");

  useEffect(() => {
    return () => {
      invoke("audio_capture_stop").catch(() => {
        // best effort
      });
      vadManager.destroy();
    };
  }, [vadManager]);

  useEffect(() => {
    invoke<string>("linux_media_permission_get_decision")
      .then((decision) => {
        setPermissionDecision(decision);
      })
      .catch(() => {
        setPermissionDecision("unknown");
      });
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowTs(now);
      if (!lastSpeechStartTs) {
        setSpeechDetected(false);
        return;
      }
      const active = now - lastSpeechStartTs <= SPEECH_ACTIVE_MS;
      setSpeechDetected(active);
    }, 200);
    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, lastSpeechStartTs]);

  const correlationState: CorrelationState = speechDetected
    ? TEAM_MEMBER_STATE
    : EXTERNAL_STATE;

  async function startVADTest() {
    setWarning("");
    setLastPreflightError("");
    try {
      // Preflight to surface actionable getUserMedia errors in UI.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      setAudioDeviceCount(audioInputs.length);

      // Start mic capture for VAD test (ignore if already capturing from meeting page)
      try {
        await invoke("audio_capture_start", {
          sessionId: "vad-test",
          micDeviceId: null,
          sysDeviceId: null,
          role: "participant",
        });
      } catch (captureError) {
        if (!String(captureError).includes("already running")) {
          throw captureError;
        }
      }

      await vadManager.start({
        onSpeechStart: () => {
          const now = Date.now();
          setLastSpeechStartTs(now);
          setSpeechDetected(true);
          setEvents((prev) =>
            [
              {
                id: `speech_start_${now}`,
                type: "speech_start" as const,
                ts: now,
              },
              ...prev,
            ].slice(0, 30)
          );
        },
        onSpeechEnd: () => {
          const now = Date.now();
          setLastSpeechEndTs(now);
          setSpeechDetected(false);
          setEvents((prev) =>
            [
              {
                id: `speech_end_${now}`,
                type: "speech_end" as const,
                ts: now,
              },
              ...prev,
            ].slice(0, 30)
          );
        },
      });
      setIsRunning(true);
    } catch (error) {
      const message = String(error);
      setWarning(`Unable to start VAD test: ${message}`);
      setLastPreflightError(message);
      setIsRunning(false);
    }
  }

  function stopVADTest() {
    vadManager.destroy();
    invoke("audio_capture_stop").catch(() => {
      // best effort
    });
    setIsRunning(false);
    setSpeechDetected(false);
  }

  function clearDebugHistory() {
    setEvents([]);
    setLastSpeechStartTs(null);
    setLastSpeechEndTs(null);
  }

  async function resetPermissionDecision() {
    try {
      await invoke("linux_media_permission_reset");
      const decision = await invoke<string>(
        "linux_media_permission_get_decision"
      );
      setPermissionDecision(decision);
    } catch (error) {
      setWarning(`Unable to reset permission decision: ${String(error)}`);
    }
  }

  const msSinceLastSpeechStart =
    lastSpeechStartTs === null ? null : nowTs - lastSpeechStartTs;
  const activeWindowRemainingMs =
    msSinceLastSpeechStart === null
      ? null
      : Math.max(0, SPEECH_ACTIVE_MS - msSinceLastSpeechStart);

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-4 pt-2">
      <section className="rounded-xl border border-border bg-bg-subtle p-4">
        <h1 className="font-semibold text-base text-fg">Settings</h1>
        <p className="mt-1 text-fg-muted text-xs">
          Validate local VAD and correlate your speaking signal to meeting-mode
          speaker identity labels.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-bg-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium text-fg text-sm">VAD Correlation</h2>
            <p className="mt-1 text-fg-muted text-xs">
              Speak into your microphone. If VAD detects speech, this test
              reports <strong>TEAM MEMBER</strong>; otherwise{" "}
              <strong>EXTERNAL</strong>.
            </p>
          </div>
          <span
            className={
              correlationState === TEAM_MEMBER_STATE
                ? "rounded-full border border-success-fg/50 bg-success-bg px-2 py-1 font-semibold text-[11px] text-success-fg"
                : "rounded-full border border-border-subtle bg-bg px-2 py-1 font-semibold text-[11px] text-fg-muted"
            }
          >
            {correlationState}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            className="inline-flex h-8 items-center rounded-lg border border-border bg-bg px-3 font-medium text-fg text-xs transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRunning}
            onClick={() => {
              startVADTest().catch(() => {
                // warning state handles error messaging
              });
            }}
            type="button"
          >
            Start Test
          </button>
          <button
            className="inline-flex h-8 items-center rounded-lg border border-border bg-bg px-3 font-medium text-fg text-xs transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!isRunning}
            onClick={stopVADTest}
            type="button"
          >
            Stop Test
          </button>
          <span className="text-fg-muted text-xs">
            Status: {isRunning ? "Listening" : "Stopped"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-fg-muted text-xs">
            Linux media permission: {permissionDecision}
          </span>
          <button
            className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] text-fg-muted transition hover:bg-bg-subtle"
            onClick={() => {
              resetPermissionDecision().catch(() => {
                // warning state is updated in function
              });
            }}
            type="button"
          >
            Reset Permission Decision
          </button>
        </div>
        <div className="mt-2 text-fg-muted text-xs">
          Audio input devices detected:{" "}
          {audioDeviceCount === null ? "n/a" : audioDeviceCount}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 text-fg-muted text-xs sm:grid-cols-2">
          <p>Last speech start: {formatTimestamp(lastSpeechStartTs)}</p>
          <p>Last speech end: {formatTimestamp(lastSpeechEndTs)}</p>
          <p>
            ms since speech start:{" "}
            {msSinceLastSpeechStart === null ? "n/a" : msSinceLastSpeechStart}
          </p>
          <p>
            active window remaining:{" "}
            {activeWindowRemainingMs === null ? "n/a" : activeWindowRemainingMs}
          </p>
        </div>

        {warning ? (
          <p className="mt-3 rounded-md border border-warning-fg/50 bg-warning-bg px-2 py-1 text-warning-fg text-xs">
            {warning}
          </p>
        ) : null}
        {lastPreflightError ? (
          <p className="mt-2 rounded-md border border-danger-fg/50 bg-danger-bg px-2 py-1 text-danger-fg text-xs">
            getUserMedia error: {lastPreflightError}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg border border-border bg-bg p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium text-fg text-xs">VAD debug events</p>
            <button
              className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] text-fg-muted transition hover:bg-bg-subtle"
              onClick={clearDebugHistory}
              type="button"
            >
              Clear
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-fg-muted text-xs">
              No events yet. Start test and speak to populate transition
              history.
            </p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-auto pr-1 text-xs">
              {events.map((event) => (
                <li
                  className="flex items-center justify-between rounded-md border border-border-subtle px-2 py-1"
                  key={event.id}
                >
                  <span
                    className={
                      event.type === "speech_start"
                        ? "font-medium text-success-fg"
                        : "font-medium text-fg-muted"
                    }
                  >
                    {event.type}
                  </span>
                  <span className="text-fg-muted">
                    {new Date(event.ts).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
