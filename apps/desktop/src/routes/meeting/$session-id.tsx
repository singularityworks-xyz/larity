import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../../features/auth/use-session";
import {
  mapBackendCommitmentToLive,
  mapBackendTopicToLive,
  mapBackendUtteranceToLive,
  mapSpeakerToParticipant,
} from "../../features/meeting-live/mappers";
import { MeetingHeader } from "../../features/meeting-live/meeting-header";
import { MeetingSidebar } from "../../features/meeting-live/meeting-sidebar";
import { TopicsTimeline } from "../../features/meeting-live/topics-timeline";
import { TranscriptStream } from "../../features/meeting-live/transcript-stream";
import type {
  LiveCommitment,
  LiveParticipant,
  LivePendingUtterance,
  LiveTopic,
  LiveUtterance,
} from "../../features/meeting-live/types";
import { api } from "../../lib/api";
import {
  buttonClass,
  codeClass,
  controlRowClass,
  cx,
  labelClass,
  panelClass,
  preClass,
  selectClass,
  statsGridClass,
  warningBannerClass,
} from "../../lib/ui";
import {
  type AudioFramePayload,
  type AudioStatusSnapshot,
  AudioStreamingClient,
} from "../../services/audio-streaming";
import { VadManager } from "../../services/vad";

interface MeetingLocationState {
  role?: "host" | "participant";
  websocketUrl?: string;
  clientName?: string;
  meetingTitle?: string;
  startedAt?: number;
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

function pendingOverlapsSttRange(
  p: LivePendingUtterance,
  utteranceStartOffset: number,
  utteranceDuration: number,
  slackSec = 0.5
): boolean {
  const u0 = utteranceStartOffset - slackSec;
  const u1 = utteranceStartOffset + utteranceDuration + slackSec;
  const p0 = p.startSec - slackSec;
  const p1 = p.startSec + p.durationSec + slackSec;
  return p0 < u1 && p1 > u0;
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

  const clientDisplayName = state.clientName ?? "Client";
  const meetingDisplayTitle = state.meetingTitle ?? "Live meeting";
  const meetingStartedAtMs =
    typeof state.startedAt === "number" ? state.startedAt : Date.now();

  const streamingClient = useMemo(() => {
    return new AudioStreamingClient({
      wsBaseUrl,
      userId,
      role,
    });
  }, [role, userId, wsBaseUrl]);

  const vadManager = useMemo(() => new VadManager(), []);
  const isHost = role === "host";

  const [topics, setTopics] = useState<LiveTopic[]>([]);
  const [utterances, setUtterances] = useState<LiveUtterance[]>([]);
  const [pendingFinals, setPendingFinals] = useState<LivePendingUtterance[]>(
    []
  );
  const [livePartial, setLivePartial] = useState<{
    text: string;
    ts: number;
    channel: number;
  } | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [commitments, setCommitments] = useState<LiveCommitment[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [rememberBanner, setRememberBanner] = useState<string | null>(null);

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

  const clearScrollTarget = useCallback(() => {
    setScrollTargetId(null);
  }, []);

  const handleTopicSelect = useCallback(
    (topic: LiveTopic) => {
      setActiveTopicId(topic.id);
      const after = utterances.find((u) => u.timestamp >= topic.startedAt);
      if (after) {
        setScrollTargetId(after.id);
        return;
      }
      let fallback: LiveUtterance | undefined;
      for (let i = utterances.length - 1; i >= 0; i -= 1) {
        const u = utterances[i];
        if (u && u.timestamp < topic.startedAt) {
          fallback = u;
          break;
        }
      }
      if (fallback) {
        setScrollTargetId(fallback.id);
      }
    },
    [utterances]
  );

  const handleEvidenceClick = useCallback((utteranceId: string) => {
    setScrollTargetId(utteranceId);
  }, []);

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
      .catch(() => {
        // VAD optional for transcript UI
      });

    return () => {
      vadManager.destroy();
    };
  }, [vadManager, streamingClient, sessionId]);

  useEffect(() => {
    const unsubUtterance = streamingClient.subscribe("utterance", (data) => {
      const timing = data as unknown as {
        startOffset?: number;
        duration?: number;
      };
      const startOffset = timing.startOffset;
      const duration = timing.duration;

      const utterance = mapBackendUtteranceToLive(
        data as unknown as Parameters<typeof mapBackendUtteranceToLive>[0]
      );
      setUtterances((prev) => {
        if (prev.some((u) => u.id === utterance.id)) {
          return prev;
        }
        return [...prev, utterance];
      });
      if (typeof startOffset === "number" && typeof duration === "number") {
        setPendingFinals((prev) =>
          prev.filter((p) => !pendingOverlapsSttRange(p, startOffset, duration))
        );
      }
      setParticipants((prev) => {
        const raw = data as unknown as { speaker?: Record<string, unknown> };
        if (!raw.speaker) {
          return prev;
        }
        const participant = mapSpeakerToParticipant(
          raw.speaker as unknown as Parameters<
            typeof mapSpeakerToParticipant
          >[0]
        );
        if (prev.some((p) => p.id === participant.id)) {
          return prev;
        }
        return [...prev, participant];
      });
    });

    const unsubTopic = streamingClient.subscribe("topic", (data) => {
      const topic = mapBackendTopicToLive(
        data as unknown as Parameters<typeof mapBackendTopicToLive>[0]
      );
      setTopics((prev) => {
        const idx = prev.findIndex((t) => t.id === topic.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = topic;
          return updated;
        }
        return [...prev, topic];
      });
    });

    const unsubLedger = streamingClient.subscribe("ledger", (data) => {
      const raw = data as unknown as {
        commitment?: Record<string, unknown>;
      };
      if (!raw.commitment) {
        return;
      }
      const live = mapBackendCommitmentToLive(
        raw.commitment as unknown as Parameters<
          typeof mapBackendCommitmentToLive
        >[0]
      );
      setCommitments((prev) => {
        const idx = prev.findIndex((c) => c.id === live.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = live;
          return updated;
        }
        return [...prev, live];
      });
      setUtterances((prev) =>
        prev.map((u) =>
          u.id === live.sourceUtteranceId ? { ...u, isCommitment: true } : u
        )
      );
    });

    const unsubSttPartial = streamingClient.subscribe("stt_partial", (data) => {
      const transcript =
        typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!transcript) {
        return;
      }
      const ts = typeof data.ts === "number" ? data.ts : Date.now();
      const channel = typeof data.channel === "number" ? data.channel : 0;
      setLivePartial({ text: transcript, ts, channel });
    });

    const unsubSttFinal = streamingClient.subscribe("stt_final", (data) => {
      setLivePartial(null);
      const transcript =
        typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!transcript) {
        return;
      }
      const channel = typeof data.channel === "number" ? data.channel : 0;
      const startSec = typeof data.start === "number" ? data.start : 0;
      const durationSec = typeof data.duration === "number" ? data.duration : 0;
      const ts = typeof data.ts === "number" ? data.ts : Date.now();
      const key = `${channel}:${startSec.toFixed(3)}`;
      setPendingFinals((prev) => {
        const withoutSameKey = prev.filter((p) => p.key !== key);
        return [
          ...withoutSameKey,
          {
            key,
            text: transcript,
            channel,
            startSec,
            durationSec,
            ts,
          },
        ];
      });
    });

    return () => {
      unsubUtterance();
      unsubTopic();
      unsubLedger();
      unsubSttPartial();
      unsubSttFinal();
    };
  }, [streamingClient]);

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
      navigate("/home");
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
      navigate("/home");
    }
  }

  function handleRememberThis() {
    setRememberBanner(
      "Marked this moment — last ~30s will be structured when capture pipeline runs."
    );
    window.setTimeout(() => setRememberBanner(null), 8000);
  }

  return (
    <main className="fixed inset-x-0 top-9 bottom-0 z-10 flex flex-col overflow-hidden bg-bg">
      <MeetingHeader
        alertsMuted={alertsMuted}
        clientName={clientDisplayName}
        isEndingBusy={isBusy}
        isHost={isHost}
        meetingTitle={meetingDisplayTitle}
        onEndMeeting={() => {
          leaveMeeting().catch(() => {
            // handled via warning state
          });
        }}
        onMuteAlertsToggle={() => setAlertsMuted((previous) => !previous)}
        onRememberThis={handleRememberThis}
        startedAtMs={meetingStartedAtMs}
      />

      {rememberBanner ? (
        <div
          aria-live="polite"
          className="border-border-subtle border-b bg-info-bg px-4 py-2 text-info-fg text-xs"
        >
          {rememberBanner}
        </div>
      ) : null}

      {warning ? (
        <div
          aria-live="polite"
          className={cx(warningBannerClass, "rounded-none border-x-0")}
        >
          {warning}
        </div>
      ) : null}

      <TopicsTimeline
        activeTopicId={activeTopicId}
        meetingStartedAtMs={meetingStartedAtMs}
        onSelectTopic={handleTopicSelect}
        topics={topics}
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <TranscriptStream
          livePartial={livePartial}
          meetingStartedAtMs={meetingStartedAtMs}
          onConsumedScrollTarget={clearScrollTarget}
          pendingFinals={pendingFinals}
          scrollTargetId={scrollTargetId}
          utterances={utterances}
        />

        <MeetingSidebar
          commitments={commitments}
          meetingStartedAtMs={meetingStartedAtMs}
          onEvidenceClick={handleEvidenceClick}
          participants={participants}
          sessionId={sessionId || "unknown"}
        />
      </div>

      {isHost ? (
        <details className="shrink-0 border-border border-t bg-bg-subtle">
          <summary className="cursor-pointer select-none px-4 py-2 font-medium text-[11px] text-fg-muted">
            Audio diagnostics &amp; controls
          </summary>
          <div className="border-border-subtle border-t px-4 py-3">
            <section className={panelClass}>
              <p className="mt-0 mb-2 font-medium text-fg-muted text-xs">
                Role: <strong className="text-fg">{role}</strong>
              </p>
              <p className="mt-0 mb-3 font-medium text-fg-muted text-xs">
                Session ID:{" "}
                <code className={codeClass}>{sessionId || "—"}</code>
              </p>

              <div className={controlRowClass}>
                <button
                  className={buttonClass()}
                  disabled={status?.active || isBusy}
                  onClick={() => {
                    startCapture().catch(() => {
                      // noop
                    });
                  }}
                  type="button"
                >
                  Start capture
                </button>
                <button
                  className={buttonClass()}
                  disabled={!status?.active || isBusy}
                  onClick={() => {
                    stopCapture().catch(() => {
                      // noop
                    });
                  }}
                  type="button"
                >
                  Stop capture
                </button>
              </div>

              {devices.length > 0 ? (
                <div className={cx(controlRowClass, "mt-4")}>
                  <label className={labelClass}>
                    Microphone:
                    <select
                      className={cx(selectClass, "ml-2 w-auto")}
                      disabled={status?.active || isBusy}
                      onChange={(event) => setMicDeviceId(event.target.value)}
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
                  <label className={cx(labelClass, "ml-4")}>
                    System audio:
                    <select
                      className={cx(selectClass, "ml-2 w-auto")}
                      disabled={status?.active || isBusy}
                      onChange={(event) => setSysDeviceId(event.target.value)}
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
              ) : null}
            </section>

            <section className={cx(panelClass, statsGridClass, "mt-3")}>
              <div>
                <h3 className="mt-0 font-medium text-fg text-sm">
                  Capture status
                </h3>
                <pre className={preClass}>
                  {JSON.stringify(status, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="mt-0 font-medium text-fg text-sm">
                  Streaming metrics
                </h3>
                <p className="text-xs">
                  Frames received from Rust: {framesReceived}
                </p>
                <p className="text-xs">Frames sent to realtime: {framesSent}</p>
                <p className="text-xs">
                  Frames dropped by backpressure: {framesDropped}
                </p>
                <p className="text-xs">
                  Last frame timestamp: {lastTs || "none"}
                </p>
              </div>
            </section>
          </div>
        </details>
      ) : null}
    </main>
  );
}
