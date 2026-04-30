import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../../features/auth/use-session";
import { api } from "../../lib/api";
import {
  type AudioFramePayload,
  type AudioStatusSnapshot,
  AudioStreamingClient,
} from "../../services/audio-streaming";
import { VadManager } from "../../services/vad";
import { AppShell } from "../shared";

interface MeetingLocationState {
  role?: "host" | "participant";
  websocketUrl?: string;
}

interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:9001";
const FALLBACK_USER_ID = import.meta.env.VITE_WS_USER_ID ?? "desktop-host";

function getWsBaseUrl(websocketUrl: string | undefined): string {
  if (!websocketUrl) {
    return DEFAULT_WS_URL;
  }

  try {
    const parsed = new URL(websocketUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return DEFAULT_WS_URL;
  }
}

export function MeetingPage() {
  const navigate = useNavigate();
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const session = useAuthSession();

  const state = (location.state ?? {}) as MeetingLocationState;
  const role = state.role ?? "participant";
  const wsBaseUrl = getWsBaseUrl(state.websocketUrl);
  const userId = session.user?.id ?? FALLBACK_USER_ID;

  const streamingClient = useMemo(() => {
    return new AudioStreamingClient({
      wsBaseUrl,
      userId,
      role,
    });
  }, [role, userId, wsBaseUrl]);

  const vadManager = useMemo(() => new VadManager(), []);
  const isHost = role === "host";

  const [status, setStatus] = useState<AudioStatusSnapshot | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [framesDropped, setFramesDropped] = useState(0);
  const [lastTs, setLastTs] = useState<number>(0);
  const [warning, setWarning] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [sysDeviceId, setSysDeviceId] = useState<string | null>(null);

  const pageSubtitle = useMemo(() => {
    if (isHost) {
      return `Hosting session ${sessionId}`;
    }
    return `Joined session ${sessionId}`;
  }, [isHost, sessionId]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const nextStatus = await invoke<AudioStatusSnapshot>(
        "audio_capture_status"
      );
      setStatus(nextStatus);
    } catch (error) {
      setWarning(`Unable to read capture status: ${String(error)}`);
    }
  }, []);

  const startCapture = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    try {
      streamingClient.connect(sessionId);
      await invoke("audio_capture_start", {
        sessionId,
        micDeviceId: micDeviceId || null,
        sysDeviceId: sysDeviceId || null,
        role,
      });
      await refreshStatus();
    } catch (error) {
      const message = String(error);
      if (!message.includes("already running")) {
        setWarning(`Failed to start capture: ${message}`);
      }
    }
  }, [
    refreshStatus,
    sessionId,
    streamingClient,
    micDeviceId,
    sysDeviceId,
    role,
  ]);

  const stopCapture = useCallback(async (): Promise<void> => {
    try {
      await invoke("audio_capture_stop");
      await refreshStatus();
    } catch (error) {
      const message = String(error);
      if (!message.includes("not running")) {
        setWarning(`Failed to stop capture: ${message}`);
      }
    }
  }, [refreshStatus]);

  useEffect(() => {
    streamingClient.setIdentity(userId, role);
  }, [role, streamingClient, userId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    vadManager
      .start({
        onSpeechStart: () => {
          streamingClient.sendVadSignal("vad_speaking", sessionId);
        },
        onSpeechEnd: () => {
          streamingClient.sendVadSignal("vad_silence", sessionId);
        },
      })
      .catch((e) => console.error("Failed to start VAD", e));

    return () => {
      vadManager.destroy();
    };
  }, [vadManager, streamingClient, sessionId]);

  useEffect(() => {
    if (isHost) {
      invoke<AudioDevice[]>("audio_capture_list_devices")
        .then((list) => setDevices(list))
        .catch((e) => setWarning(`Failed to list devices: ${String(e)}`));
    }
  }, [isHost]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    streamingClient.connect(sessionId);
    refreshStatus().catch(() => {
      // noop, warning handled in refreshStatus
    });

    startCapture().catch(() => {
      // noop, warning handled in startCapture
    });

    const unlistenPromise = listen<AudioFramePayload>(
      "audio-frame",
      (event) => {
        if (!isHost) {
          return;
        }

        setFramesReceived((previous) => previous + 1);
        setLastTs(event.payload.ts);

        const result = streamingClient.handleAudioFrame({
          payload: event.payload,
        });
        const metrics = streamingClient.getMetrics();
        setFramesSent(metrics.framesSent);
        setFramesDropped(metrics.framesDropped);

        if (result.dropped || result.sent) {
          setWarning(streamingClient.getWarning());
        }
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => {
        unlisten();
      });

      stopCapture().catch(() => {
        // noop
      });

      streamingClient.disconnect();
    };
  }, [
    refreshStatus,
    sessionId,
    startCapture,
    stopCapture,
    streamingClient,
    isHost,
  ]);

  async function leaveMeeting() {
    if (!sessionId) {
      navigate("/dashboard");
      return;
    }

    setIsBusy(true);
    try {
      if (isHost) {
        await api.post("/meeting-session/end", {
          sessionId,
          reason: "user_ended",
        });
      }
      await stopCapture();
    } catch (error) {
      setWarning(
        error instanceof Error
          ? error.message
          : "Failed to close meeting cleanly"
      );
    } finally {
      streamingClient.disconnect();
      setIsBusy(false);
      navigate("/dashboard");
    }
  }

  return (
    <AppShell subtitle={pageSubtitle} title="Meeting room">
      <section className="panel">
        <h2>Session details</h2>
        <p>
          Role: <strong>{role}</strong>
        </p>
        <p>
          Session ID: <code>{sessionId}</code>
        </p>

        <div className="control-row">
          {isHost ? (
            <>
              <button
                disabled={status?.active || isBusy}
                onClick={() => {
                  startCapture().catch(() => {
                    // noop
                  });
                }}
                type="button"
              >
                Start Capture
              </button>
              <button
                disabled={!status?.active || isBusy}
                onClick={() => {
                  stopCapture().catch(() => {
                    // noop
                  });
                }}
                type="button"
              >
                Stop Capture
              </button>
              <button disabled={isBusy} onClick={leaveMeeting} type="button">
                End Meeting
              </button>
            </>
          ) : (
            <button disabled={isBusy} onClick={leaveMeeting} type="button">
              Leave Meeting
            </button>
          )}
        </div>
        {isHost && devices.length > 0 && (
          <div className="control-row" style={{ marginTop: "1rem" }}>
            <label>
              Microphone:
              <select
                disabled={status?.active || isBusy}
                onChange={(e) => setMicDeviceId(e.target.value)}
                style={{ marginLeft: "0.5rem" }}
                value={micDeviceId || ""}
              >
                <option value="">(OS Default)</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ marginLeft: "1rem" }}>
              System Audio:
              <select
                disabled={status?.active || isBusy}
                onChange={(e) => setSysDeviceId(e.target.value)}
                style={{ marginLeft: "0.5rem" }}
                value={sysDeviceId || ""}
              >
                <option value="">(OS Default Loopback)</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="panel stats-grid">
        <div>
          <h3>Capture Status</h3>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>
        <div>
          <h3>Streaming Metrics</h3>
          <p>Frames received from Rust: {framesReceived}</p>
          <p>Frames sent to realtime: {framesSent}</p>
          <p>Frames dropped by backpressure: {framesDropped}</p>
          <p>Last frame timestamp: {lastTs || "none"}</p>
        </div>
      </section>

      {warning ? (
        <section aria-live="polite" className="warning-banner">
          {warning}
        </section>
      ) : null}
    </AppShell>
  );
}
