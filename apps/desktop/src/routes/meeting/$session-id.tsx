import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCard } from "../../features/alerts/alert-card";
import { mapBackendAlertToMeetingAlert } from "../../features/alerts/mapper";
import { useAlertQueue } from "../../features/alerts/use-alert-queue";
import { useAuthSession } from "../../features/auth/use-session";
import { AmbientStatusBar } from "../../features/meeting-live/ambient-status-bar";
import {
  mapBackendCommitmentToLive,
  mapBackendTopicToLive,
  mapBackendUtteranceToLive,
  mapSpeakerToParticipant,
} from "../../features/meeting-live/mappers";

const UNIDENTIFIED_SPEAKER_REGEX = /^Speaker \d+$/i;

import { MeetingHeader } from "../../features/meeting-live/meeting-header";
import { MeetingSidebar } from "../../features/meeting-live/meeting-sidebar";
import { NameConfigModal } from "../../features/meeting-live/name-config-modal";
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
  closeOverlayWindow,
  createOverlayWindow,
} from "../../lib/overlay-window";
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
  allowNameCustomization?: boolean;
  meetingId?: string;
  pendingAgenda?: Array<{ id: string; text: string }>;
}

interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:9001";
const FALLBACK_USER_ID = import.meta.env.VITE_WS_USER_ID ?? "desktop-host";

import { useClientMembers } from "../../features/clients/use-client-members";
import { useConfirmSpeakerMapping } from "../../features/meetings/use-confirm-speaker-mapping";
import { useMeeting } from "../../features/meetings/use-meeting";
import { useMeetingSessionStatus } from "../../features/meetings/use-meeting-session-status";

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
  source: "deepgram" | "sambanova" | "gemini"
): string {
  if (source === "deepgram") {
    return "STT";
  }
  if (source === "sambanova") {
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

  const streamingClient = useMemo(() => {
    return new AudioStreamingClient({
      wsBaseUrl,
      userId,
      userName: displayName,
      role,
    });
  }, [role, userId, displayName, wsBaseUrl]);

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
  // const [rememberBanner, setRememberBanner] = useState<string | null>(null);
  const [constraintCount, setConstraintCount] = useState(0);
  const [ambientTopic, setAmbientTopic] = useState<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(true);

  const [status, setStatus] = useState<AudioStatusSnapshot | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [framesDropped, setFramesDropped] = useState(0);
  const [lastTs, setLastTs] = useState<number>(0);
  const [warning, setWarning] = useState("");
  const [systemEvents, setSystemEvents] = useState<
    Array<{
      eventId: string;
      source: "deepgram" | "sambanova" | "gemini";
      severity: "info" | "warning" | "error";
      code: string;
      message: string;
      timestamp: number;
    }>
  >([]);
  const [isBusy, setIsBusy] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [sysDeviceId, setSysDeviceId] = useState<string | null>(null);
  // meetingId received from the meeting_processed WebSocket event after pipeline completes
  const [postProcessingMeetingId, setPostProcessingMeetingId] = useState<
    string | null
  >(null);

  const alertQueue = useAlertQueue();
  const addAlertRef = useRef(alertQueue.addAlert);
  addAlertRef.current = alertQueue.addAlert;
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const unidentifiedAlertedRef = useRef<Set<string>>(new Set());

  const [identityGuesses, setIdentityGuesses] = useState<
    Array<{ id: string; index: string; memberId: string }>
  >([]);

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

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const nextStatus = await invoke<AudioStatusSnapshot>(
        "audio_capture_status"
      );
      setStatus(nextStatus);
      setIsStreamActive(nextStatus?.active ?? false);
    } catch (error) {
      setWarning(`Unable to read capture status: ${String(error)}`);
      setIsStreamActive(false);
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
      // Navigate to meeting review if processing has already completed; otherwise home
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

    let unlisten: (() => void) | null = null;

    listen<{ sessionId: string }>("overlay:end-meeting", (evt) => {
      if (evt.payload.sessionId !== sessionId) {
        return;
      }
      leaveMeeting().catch(() => {
        /* meeting already ended */
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [sessionId, leaveMeeting]);

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
    const interval = setInterval(() => {
      const now = Date.now();
      setPendingFinals((prev) => {
        const active = prev.filter((p) => now - p.ts <= 5000);
        if (active.length === prev.length) {
          return prev;
        }
        return active;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Unidentified Speaker Detection (10 minutes)
  useEffect(() => {
    if (!(sessionId && isHost)) {
      return;
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - meetingStartedAtMs;

      // Only check if more than 10 minutes have passed
      if (elapsedMs < 10 * 60 * 1000) {
        return;
      }

      for (const p of participants) {
        // Speaker is unidentified if EXTERNAL and name is still the generic fallback
        const isUnidentified =
          p.type === "EXTERNAL" &&
          (p.confidence ?? 0) < 0.8 &&
          UNIDENTIFIED_SPEAKER_REGEX.test(p.name);

        if (isUnidentified && !unidentifiedAlertedRef.current.has(p.id)) {
          unidentifiedAlertedRef.current.add(p.id);
          addAlertRef.current({
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
    }, 30_000); // Check every 30 seconds

    return () => clearInterval(checkInterval);
  }, [sessionId, meetingStartedAtMs, participants, isHost]);

  useEffect(() => {
    const unsubUtterance = streamingClient.subscribe("utterance", (data) => {
      const raw = data as unknown as {
        utteranceId: string;
        retracted?: boolean;
        speaker?: Record<string, unknown>;
        startOffset?: number;
        duration?: number;
      };

      if (raw.retracted) {
        setUtterances((prev) => prev.filter((u) => u.id !== raw.utteranceId));
        return;
      }

      const startOffset = raw.startOffset;
      const duration = raw.duration;

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
        if (!raw.speaker) {
          return prev;
        }
        const participant = mapSpeakerToParticipant(
          raw.speaker as unknown as Parameters<
            typeof mapSpeakerToParticipant
          >[0],
          userId
        );
        const idx = prev.findIndex((p) => p.id === participant.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = participant;
          return updated;
        }
        return [...prev, participant];
      });
      if (raw.speaker) {
        emitTo("meeting-overlay", "overlay-data", {
          type: "utterance",
          payload: { speaker: raw.speaker },
        }).catch((err) =>
          console.warn("overlay-data utterance emit failed:", err)
        );
      }
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
      setActiveTopicId((prev) => {
        if (prev === topic.id) {
          return prev;
        }
        return topic.id;
      });
      setAmbientTopic(topic.label);
      const rawConstraints = data as unknown as {
        constraintsMentioned?: unknown[];
      };
      const mentioned = rawConstraints.constraintsMentioned;
      if (Array.isArray(mentioned) && mentioned.length > 0) {
        setConstraintCount((prev) => prev + mentioned.length);
      }
      emitTo("meeting-overlay", "overlay-data", {
        type: "topic",
        payload: {
          label: topic.label,
          constraintsMentioned: Array.isArray(mentioned) ? mentioned.length : 0,
        },
      }).catch((err) => console.warn("overlay-data topic emit failed:", err));
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
      emitTo("meeting-overlay", "overlay-data", {
        type: "ledger",
        payload: { commitmentId: live.id },
      }).catch((err) => console.warn("overlay-data ledger emit failed:", err));
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

    const unsubAlert = streamingClient.subscribe("alert", (data) => {
      const alert = mapBackendAlertToMeetingAlert(data);
      if (alert) {
        addAlertRef.current(alert);
        emitTo("meeting-overlay", "overlay-data", {
          type: "alert",
          payload: alert,
        }).catch((err) => console.warn("overlay-data alert emit failed:", err));
      }
    });

    const unsubParticipantEvent = streamingClient.subscribe(
      "participant_event",
      (data: Record<string, unknown>) => {
        const participantData: Record<string, unknown> = {};
        if (
          data.type === "participant_list" &&
          Array.isArray(data.participants)
        ) {
          participantData.type = "participant_list";
          participantData.participants = data.participants;
        } else if (typeof data.type === "string") {
          participantData.type = data.type;
        }
        emitTo("meeting-overlay", "overlay-data", {
          type: "participant_event",
          payload: participantData,
        }).catch((err) =>
          console.warn("overlay-data participant_event emit failed:", err)
        );
      }
    );

    const unsubProcessed = streamingClient.subscribe(
      "meeting_processed",
      (data: Record<string, unknown>) => {
        const meetingId =
          typeof data.meetingId === "string" ? data.meetingId : null;
        if (meetingId) {
          setPostProcessingMeetingId(meetingId);
        }
      }
    );

    const unsubSpeakerGuess = streamingClient.subscribe(
      "speaker_identity_guessed",
      (data: Record<string, unknown>) => {
        const payload = data.payload as Record<string, unknown>;
        if (
          !payload ||
          typeof payload.deepgramIndex !== "string" ||
          typeof payload.clientMemberId !== "string"
        ) {
          return;
        }
        const index = payload.deepgramIndex;
        const memberId = payload.clientMemberId;
        const id = Date.now().toString() + Math.random();
        setIdentityGuesses((prev) => [...prev, { id, index, memberId }]);
        emitTo("meeting-overlay", "overlay-data", {
          type: "speaker_identity_guessed",
          payload: { id, index, memberId },
        }).catch((err) =>
          console.warn(
            "overlay-data speaker_identity_guessed emit failed:",
            err
          )
        );
      }
    );

    const unsubSystemEvent = streamingClient.subscribe(
      "system_event",
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pre-existing, refactor deferred
      (data: Record<string, unknown>) => {
        const eventId =
          typeof data.eventId === "string"
            ? data.eventId
            : Math.random().toString();
        const source =
          typeof data.source === "string" ? data.source : "deepgram";
        const severity =
          typeof data.severity === "string" ? data.severity : "warning";
        const code = typeof data.code === "string" ? data.code : "unknown";
        const message = typeof data.message === "string" ? data.message : "";
        const timestamp =
          typeof data.timestamp === "number" ? data.timestamp : Date.now();

        const newEvent = {
          eventId,
          source: source as "deepgram" | "sambanova" | "gemini",
          severity: severity as "info" | "warning" | "error",
          code,
          message,
          timestamp,
        };

        setSystemEvents((prev) => {
          const index = prev.findIndex((e) => e.code === code);
          if (index !== -1) {
            const copy = [...prev];
            copy[index] = newEvent;
            return copy;
          }
          return [...prev, newEvent];
        });

        if (severity !== "error") {
          setTimeout(() => {
            setSystemEvents((prev) =>
              prev.filter((e) => e.eventId !== eventId)
            );
          }, 8000);
        }
      }
    );

    return () => {
      unsubUtterance();
      unsubTopic();
      unsubLedger();
      unsubSttPartial();
      unsubSttFinal();
      unsubAlert();
      unsubParticipantEvent();
      unsubProcessed();
      unsubSpeakerGuess();
      unsubSystemEvent();
    };
  }, [streamingClient, userId]);

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

    if (allowNameCustomization && configuredName === null) {
      return;
    }

    streamingClient.connect(sessionId);
    refreshStatus().catch(() => {
      // noop, warning handled in refreshStatus
    });

    startCapture().catch(() => {
      // noop, warning handled in startCapture
    });

    createOverlayWindow({
      sessionId,
      role,
      clientName: clientDisplayName,
      meetingTitle: meetingDisplayTitle,
      startedAt: meetingStartedAtMs,
      wsBaseUrl: getWsBaseUrl(state.websocketUrl),
      userId,
    }).catch(() => {
      // overlay is optional
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

      closeOverlayWindow().catch(() => {
        /* overlay may already be closed */
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
    allowNameCustomization,
    configuredName,
    role,
    userId,
    clientDisplayName,
    meetingDisplayTitle,
    meetingStartedAtMs,
    state.websocketUrl,
  ]);

  // function handleRememberThis() {
  //   setRememberBanner(
  //     "Marked this moment — last ~30s will be structured when capture pipeline runs."
  //   );
  //   window.setTimeout(() => setRememberBanner(null), 8000);
  // }

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
        // onRememberThis={handleRememberThis}
        onToggleNameCustomization={handleToggleNameCustomization}
        startedAtMs={meetingStartedAtMs}
      />

      {/* 
      {rememberBanner ? (
        <div
          aria-live="polite"
          className="border-border-subtle border-b bg-info-bg px-4 py-2 text-info-fg text-xs"
        >
          {rememberBanner}
        </div>
      ) : null}
      */}

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
              {event.severity !== "error" ? (
                <button
                  aria-label="Dismiss"
                  className="ml-2 shrink-0 text-xs opacity-60 hover:opacity-100"
                  onClick={() =>
                    setSystemEvents((prev) =>
                      prev.filter((e) => e.eventId !== event.eventId)
                    )
                  }
                  type="button"
                >
                  ✕
                </button>
              ) : null}
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
                      setIdentityGuesses((prev) =>
                        prev.filter((g) => g.id !== guess.id)
                      );
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
                        setIdentityGuesses((prev) =>
                          prev.filter((g) => g.id !== guess.id)
                        );
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
              </div>
            </section>
          </div>
        </details>
      ) : null}
    </main>
  );
}
