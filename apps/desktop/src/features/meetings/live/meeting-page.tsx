import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../../auth/use-session";
import { AlertCard } from "../alerts/alert-card";
import { useAlertQueue } from "../alerts/use-alert-queue";
import { AmbientStatusBar } from "./ambient-status-bar";

const UNIDENTIFIED_SPEAKER_REGEX = /^Speaker \d+$/i;

import { api } from "../../../lib/api";
import { WS_URL } from "../../../lib/env";
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
} from "../../../lib/ui";
import { closeOverlayWindow } from "../overlay/window";
import { AudioStreamingClient } from "./capture/audio-streaming";
import { useAudioCapture } from "./capture/use-audio-capture";
import { VadManager } from "./capture/vad";
import { useMeetingLiveEvents } from "./events/use-meeting-live-events";
import { MeetingHeader } from "./meeting-header";
import { MeetingSidebar } from "./meeting-sidebar";
import { NameConfigModal } from "./name-config-modal";
import { useMeetingConnection } from "./session/use-meeting-connection";
import { TopicsTimeline } from "./topics-timeline";
import { TranscriptStream } from "./transcript-stream";
import type { LiveTopic, LiveUtterance } from "./types";

interface MeetingLocationState {
  allowNameCustomization?: boolean;
  clientName?: string;
  meetingId?: string;
  meetingTitle?: string;
  pendingAgenda?: Array<{ id: string; text: string }>;
  role?: "host" | "participant";
  startedAt?: number;
  websocketUrl?: string;
}

const DEFAULT_WS_URL = WS_URL;
const FALLBACK_USER_ID = import.meta.env.VITE_WS_USER_ID ?? "desktop-host";

import { useClientMembers } from "../../clients/use-client-members";
import { useConfirmSpeakerMapping } from "../use-confirm-speaker-mapping";
import { useMeeting } from "../use-meeting";
import { useMeetingSessionStatus } from "../use-meeting-session-status";

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

function getSystemEventBannerClass(
  severity: "info" | "warning" | "error"
): string {
  if (severity === "error") {
    return "rounded-[var(--radius-0)] border border-danger-fg bg-danger-bg p-3 text-xs font-medium text-danger-fg flex items-start justify-between gap-2";
  }
  if (severity === "warning") {
    return "rounded-[var(--radius-0)] border border-warning-fg bg-warning-bg p-3 text-xs font-medium text-warning-fg flex items-start justify-between gap-2";
  }
  return "rounded-[var(--radius-0)] border border-border bg-bg-elevated p-3 text-xs font-medium text-fg-muted flex items-start justify-between gap-2";
}

function getSystemEventSourceLabel(
  source: "deepgram" | "generalcompute" | "gemini"
): string {
  if (source === "deepgram") {
    return "STT";
  }
  if (source === "generalcompute") {
    return "AI Classifier";
  }
  return "AI Reasoner";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pre-existing, refactor deferred
export function MeetingPage() {
  const navigate = useNavigate();
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const session = useAuthSession();

  const state = (location.state ?? {}) as MeetingLocationState;
  const { data: sessionStatus } = useMeetingSessionStatus(sessionId);
  const meetingId = state.meetingId ?? sessionStatus?.meetingId;
  const { data: meetingData } = useMeeting(meetingId);
  const { data: members = [] } = useClientMembers(meetingData?.clientId ?? "");
  const confirmSpeakerMapping = useConfirmSpeakerMapping();
  const role = state.role ?? "participant";
  const wsBaseUrl = getWsBaseUrl(state.websocketUrl);
  const userId = session.user?.id ?? FALLBACK_USER_ID;
  const accountName = session.user?.name ?? "";
  const initialAllowNameCustomization = state.allowNameCustomization ?? true;

  const clientDisplayName = state.clientName ?? "Client";
  const meetingDisplayTitle = state.meetingTitle ?? "Live meeting";
  const meetingStartedAtMs =
    typeof state.startedAt === "number" ? state.startedAt : Date.now();

  const [configuredName, setConfiguredName] = useState<string | null>(
    initialAllowNameCustomization ? null : accountName
  );
  const [allowNameCustomization, setAllowNameCustomization] = useState(
    initialAllowNameCustomization
  );
  const displayName = configuredName ?? accountName;

  // Initial name only: renames sync into the client via the setIdentity
  // effect below, so the memoized client must not rebuild when the name
  // changes (that tore down WS/capture/VAD/overlay mid-meeting, P1.12).
  // initialDisplayName never changes, keeping this memo stable.
  const [initialDisplayName] = useState(displayName);

  const streamingClient = useMemo(
    () =>
      new AudioStreamingClient({
        wsBaseUrl,
        userId,
        userName: initialDisplayName,
        role,
      }),
    [role, userId, wsBaseUrl, initialDisplayName]
  );

  const vadManager = useMemo(() => new VadManager(), []);
  const isHost = role === "host";

  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [warning, setWarning] = useState("");
  const {
    clearAudioChannel,
    devices,
    framesDropped,
    framesReceived,
    framesSent,
    isStreamActive,
    lastTs,
    micDeviceId,
    refreshStatus,
    setMicDeviceId,
    setSysDeviceId,
    startCapture,
    status,
    stopCapture,
    syncFrameMetrics,
    sysDeviceId,
  } = useAudioCapture({ role, sessionId, setWarning, streamingClient });
  const [isBusy, setIsBusy] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const alertQueue = useAlertQueue();
  const {
    activeTopicId,
    ambientTopic,
    commitments,
    constraintCount,
    dismissIdentityGuess,
    dismissSystemEvent,
    identityGuesses,
    livePartial,
    participants,
    pendingFinals,
    postProcessingMeetingId,
    setActiveTopicId,
    syncLatencyMetrics,
    systemEvents,
    topics,
    utterances,
    wsFinalMs,
    wsPartialMs,
  } = useMeetingLiveEvents({
    addAlert: alertQueue.addAlert,
    sessionId,
    streamingClient,
    userId,
    vadManager,
  });
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const unidentifiedAlertedRef = useRef<Set<string>>(new Set());

  const teamCommitmentCount = useMemo(
    () =>
      commitments.filter((c) =>
        participants.some((p) => p.id === c.speakerId && p.type === "TEAM")
      ).length,
    [commitments, participants]
  );

  const externalCommitmentCount = useMemo(
    () =>
      commitments.filter((c) =>
        participants.some((p) => p.id === c.speakerId && p.type === "EXTERNAL")
      ).length,
    [commitments, participants]
  );

  const contradictionCount = useMemo(
    () => commitments.filter((c) => c.status === "CONTRADICTED").length,
    [commitments]
  );

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
    [setActiveTopicId, utterances]
  );

  const handleEvidenceClick = useCallback((utteranceId: string) => {
    setScrollTargetId(utteranceId);
  }, []);

  const handleRoleChange = useCallback(
    (speakerId: string, role: "TEAM" | "EXTERNAL") => {
      streamingClient.changeParticipantRole(sessionId, speakerId, role);
    },
    [streamingClient, sessionId]
  );

  useEffect(() => {
    streamingClient.setIdentity(userId, role, displayName);
  }, [role, streamingClient, userId, displayName]);

  const leaveMeeting = useCallback(async () => {
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
      closeOverlayWindow().catch(() => {
        /* overlay may already be closed */
      });
      streamingClient.disconnect();
      setIsBusy(false);
      if (postProcessingMeetingId) {
        navigate(`/meeting-post/${postProcessingMeetingId}`);
      } else {
        navigate("/home");
      }
    }
  }, [
    sessionId,
    isHost,
    stopCapture,
    navigate,
    streamingClient,
    postProcessingMeetingId,
  ]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | null = null;

    listen<{ sessionId: string }>("overlay:end-meeting", (evt) => {
      if (evt.payload.sessionId !== sessionId) {
        return;
      }
      leaveMeeting().catch(() => {
        /* meeting already ended */
      });
    }).then((fn) => {
      if (isMounted) {
        unlisten = fn;
      } else {
        fn();
      }
    });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [sessionId, leaveMeeting]);

  useEffect(() => {
    if (!(sessionId && isHost)) {
      return;
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - meetingStartedAtMs;

      if (elapsedMs < 10 * 60 * 1000) {
        return;
      }

      for (const p of participants) {
        const isUnidentified =
          p.type === "EXTERNAL" &&
          (p.confidence ?? 0) < 0.8 &&
          UNIDENTIFIED_SPEAKER_REGEX.test(p.name);

        if (isUnidentified && !unidentifiedAlertedRef.current.has(p.id)) {
          unidentifiedAlertedRef.current.add(p.id);
          alertQueue.addAlert({
            id: `unidentified-speaker-${p.id}`,
            category: "unidentified_speaker",
            severity: "medium",
            title: "Identify Speaker",
            message: `${p.name} hasn't been identified. Click to assign an identity from your client roster.`,
            speakerName: p.name,
            speakerType: "EXTERNAL",
            routing: "personal",
            isShared: false,
            timestamp: Date.now(),
            confidence: 1.0,
            triggerTier: 1,
          });
        }
      }
    }, 30_000);

    return () => clearInterval(checkInterval);
  }, [
    sessionId,
    meetingStartedAtMs,
    participants,
    isHost,
    alertQueue.addAlert,
  ]);

  useMeetingConnection({
    allowNameCustomization,
    clearAudioChannel,
    clientDisplayName,
    configuredName,
    meetingDisplayTitle,
    meetingStartedAtMs,
    onMetricsSync: syncLatencyMetrics,
    refreshStatus,
    role,
    sessionId,
    setWarning,
    startCapture,
    stopCapture,
    streamingClient,
    syncFrameMetrics,
    userId,
    wsBaseUrl: getWsBaseUrl(state.websocketUrl),
  });

  async function handleToggleNameCustomization() {
    const next = !allowNameCustomization;
    try {
      await api.post(`/meeting-session/${sessionId}/config`, {
        allowNameCustomization: next,
      });
      setAllowNameCustomization(next);
    } catch (error) {
      setWarning(
        error instanceof Error
          ? error.message
          : "Failed to update name customization setting"
      );
    }
  }

  function handleNameConfirm(name: string) {
    setConfiguredName(name);
  }

  function handleNameSkip() {
    setConfiguredName(accountName);
  }

  if (allowNameCustomization && configuredName === null) {
    return (
      <NameConfigModal
        defaultName={accountName}
        onConfirm={handleNameConfirm}
        onSkip={handleNameSkip}
      />
    );
  }

  return (
    <main className="fixed inset-x-0 top-9 bottom-0 z-10 flex flex-col overflow-hidden bg-bg">
      <MeetingHeader
        alertsMuted={alertsMuted}
        allowNameCustomization={allowNameCustomization}
        clientName={clientDisplayName}
        isEndingBusy={isBusy}
        isHost={isHost}
        isStreamActive={isStreamActive}
        meetingTitle={meetingDisplayTitle}
        onEndMeeting={() => {
          leaveMeeting().catch(() => {
            // handled via warning state
          });
        }}
        onMuteAlertsToggle={() => setAlertsMuted((previous) => !previous)}
        onToggleNameCustomization={handleToggleNameCustomization}
        startedAtMs={meetingStartedAtMs}
      />

      {warning ? (
        <div
          aria-live="polite"
          className={cx(warningBannerClass, "rounded-none border-x-0")}
        >
          {warning}
        </div>
      ) : null}

      {systemEvents.length > 0 ? (
        <div aria-live="assertive">
          {systemEvents.map((event) => (
            <div
              className={getSystemEventBannerClass(event.severity)}
              key={event.eventId}
            >
              <span>
                <span className="font-semibold">
                  [{getSystemEventSourceLabel(event.source)}]
                </span>{" "}
                {event.message}
              </span>
              {event.severity === "error" ? null : (
                <button
                  aria-label="Dismiss"
                  className="ml-2 shrink-0 text-xs opacity-60 hover:opacity-100"
                  onClick={() => dismissSystemEvent(event.eventId)}
                  type="button"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <AmbientStatusBar
        constraintCount={constraintCount}
        contradictionCount={contradictionCount}
        currentTopic={ambientTopic}
        externalCommitmentCount={externalCommitmentCount}
        isStreamActive={isStreamActive}
        participants={participants}
        teamCommitmentCount={teamCommitmentCount}
      />

      <TopicsTimeline
        activeTopicId={activeTopicId}
        meetingStartedAtMs={meetingStartedAtMs}
        onSelectTopic={handleTopicSelect}
        topics={topics}
      />

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <TranscriptStream
          alertHistory={alertQueue.alertHistory}
          livePartial={livePartial}
          meetingStartedAtMs={meetingStartedAtMs}
          onConsumedScrollTarget={clearScrollTarget}
          pendingFinals={pendingFinals}
          scrollTargetId={scrollTargetId}
          utterances={utterances}
        />

        {!alertsMuted && alertQueue.visibleAlerts.length > 0 && (
          <div className="absolute top-4 left-1/2 z-50 flex w-80 max-w-full -translate-x-1/2 flex-col gap-2 px-4 md:left-4 md:translate-x-0">
            {alertQueue.visibleAlerts.map((alert) => (
              <AlertCard
                alert={alert}
                expandedId={expandedAlertId}
                key={alert.id}
                onDismiss={() => alertQueue.dismissAlert(alert.id)}
                onToggleExpand={(id) =>
                  setExpandedAlertId((prev) => (prev === id ? null : id))
                }
              />
            ))}
          </div>
        )}

        {identityGuesses.length > 0 && (
          <div className="absolute top-4 right-4 z-50 flex w-80 max-w-full flex-col gap-2">
            {identityGuesses.map((guess) => (
              <div
                className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3 shadow-md"
                key={guess.id}
              >
                <p className="text-fg text-sm">
                  Map Speaker {guess.index} to Client Member{" "}
                  {members.find((m) => m.id === guess.memberId)?.name ??
                    guess.memberId}
                  ?
                </p>
                {cardErrors[guess.id] && (
                  <p className="text-danger-fg text-xs">
                    {cardErrors[guess.id]}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded bg-bg-subtle px-2 py-1 text-fg text-xs hover:bg-bg-hover"
                    onClick={() => {
                      dismissIdentityGuess(guess.id);
                      if (cardErrors[guess.id]) {
                        setCardErrors((prev) => {
                          const next = { ...prev };
                          delete next[guess.id];
                          return next;
                        });
                      }
                    }}
                    type="button"
                  >
                    Dismiss
                  </button>
                  <button
                    className="rounded bg-accent px-2 py-1 text-on-accent text-xs hover:bg-accent-hover disabled:opacity-50"
                    disabled={!meetingId}
                    onClick={async () => {
                      if (!meetingId) {
                        return;
                      }
                      try {
                        await confirmSpeakerMapping.mutateAsync({
                          meetingId,
                          deepgramIndex: guess.index,
                          clientMemberId: guess.memberId,
                        });
                        dismissIdentityGuess(guess.id);
                        if (cardErrors[guess.id]) {
                          setCardErrors((prev) => {
                            const next = { ...prev };
                            delete next[guess.id];
                            return next;
                          });
                        }
                      } catch (err) {
                        console.error("Failed to map speaker:", err);
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        setCardErrors((prev) => ({
                          ...prev,
                          [guess.id]: `Failed to confirm speaker mapping: ${msg}`,
                        }));
                      }
                    }}
                    type="button"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <MeetingSidebar
          clientId={meetingData?.clientId}
          commitments={commitments}
          meetingStartedAtMs={meetingStartedAtMs}
          onChangeRole={handleRoleChange}
          onEvidenceClick={handleEvidenceClick}
          participants={participants}
          pendingAgenda={state.pendingAgenda}
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
                {import.meta.env.DEV ? (
                  <>
                    <p className="text-xs">
                      WS recv → render (partial, avg ms):{" "}
                      {wsPartialMs === null ? "—" : wsPartialMs.toFixed(1)}
                    </p>
                    <p className="text-xs">
                      WS recv → render (final, avg ms):{" "}
                      {wsFinalMs === null ? "—" : wsFinalMs.toFixed(1)}
                    </p>
                  </>
                ) : null}
              </div>
            </section>
          </div>
        </details>
      ) : null}
    </main>
  );
}
