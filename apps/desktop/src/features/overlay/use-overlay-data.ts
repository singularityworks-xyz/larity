import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioStreamingClient,
  type IncomingMessageHandler,
} from "../../services/audio-streaming";
import {
  mapBackendTopicToLive,
  mapSpeakerToParticipant,
} from "../meeting-live/mappers";
import type { LiveParticipant } from "../meeting-live/types";
import type { OverlayAlert, OverlaySpeaker, OverlayTeammate } from "./types";

const MAX_VISIBLE_ALERTS = 2;
const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:9001";
const WHITESPACE_RE = /\s+/;

const CRITICAL_LEVELS = new Set(["critical", "error", "danger", "high"]);
const WARNING_LEVELS = new Set(["warning", "warn", "medium"]);

function parseOverlayParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("sessionId") ?? "",
    role: params.get("role") ?? "participant",
    clientName: params.get("clientName") ?? "Client",
    meetingTitle: params.get("meetingTitle") ?? "Live meeting",
    startedAtMs: Number(params.get("startedAt") ?? Date.now()),
    wsBaseUrl: params.get("wsBaseUrl") ?? DEFAULT_WS_URL,
    userId: params.get("userId") ?? "overlay-viewer",
  };
}

function extractStringField(
  data: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    if (typeof data[key] === "string") {
      return data[key] as string;
    }
  }
  return null;
}

function extractBooleanField(
  data: Record<string, unknown>,
  ...keys: string[]
): boolean | null {
  for (const key of keys) {
    if (typeof data[key] === "boolean") {
      return data[key] as boolean;
    }
  }
  return null;
}

function resolveAlertId(data: Record<string, unknown>): string | null {
  return extractStringField(data, "alertId", "id");
}

function resolveSeverity(
  data: Record<string, unknown>
): OverlayAlert["severity"] {
  const level = String(data.level ?? data.severity ?? "");
  if (CRITICAL_LEVELS.has(level)) {
    return "critical";
  }
  if (WARNING_LEVELS.has(level)) {
    return "warning";
  }
  return "info";
}

function resolveSummary(data: Record<string, unknown>): string {
  return extractStringField(data, "summary", "message") ?? "Alert triggered";
}

function resolveIsShared(data: Record<string, unknown>): boolean {
  return extractBooleanField(data, "isShared", "shared") ?? false;
}

function resolveEvidence(
  data: Record<string, unknown>
): OverlayAlert["evidence"] | undefined {
  if (!data.evidence || typeof data.evidence !== "object") {
    return undefined;
  }
  const ev = data.evidence as Record<string, unknown>;
  const hasUtterance = typeof ev.utterance === "string";
  const hasReasoning = typeof ev.reasoning === "string";
  if (!(hasUtterance || hasReasoning)) {
    return undefined;
  }
  return {
    utterance: hasUtterance ? (ev.utterance as string) : "",
    reasoning: hasReasoning ? (ev.reasoning as string) : "",
  };
}

function extractAlertFromEvent(
  data: Record<string, unknown>
): OverlayAlert | null {
  const id = resolveAlertId(data);
  if (!id) {
    return null;
  }
  return {
    id,
    severity: resolveSeverity(data),
    summary: resolveSummary(data),
    isShared: resolveIsShared(data),
    evidence: resolveEvidence(data),
  };
}

function participantToTeammate(p: LiveParticipant): OverlayTeammate {
  const initials = p.name
    .split(WHITESPACE_RE)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return { id: p.id, name: p.name, initials: initials || "?" };
}

export function useOverlayData() {
  const params = useMemo(() => parseOverlayParams(), []);

  const streamingClient = useMemo(
    () =>
      new AudioStreamingClient({
        wsBaseUrl: params.wsBaseUrl,
        userId: params.userId,
        role: "participant",
      }),
    [params.wsBaseUrl, params.userId]
  );

  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<OverlaySpeaker | null>(
    null
  );
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [alerts, setAlerts] = useState<OverlayAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [constraintCount, setConstraintCount] = useState(0);
  const [commitmentCount, setCommitmentCount] = useState(0);
  const [isMicActive, setIsMicActive] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [rememberFlash, setRememberFlash] = useState(false);

  const dismissedRef = useRef(dismissedIds);
  dismissedRef.current = dismissedIds;

  const visibleAlerts = useMemo(() => {
    if (alertsMuted) {
      return [];
    }
    return alerts
      .filter((a) => !dismissedRef.current.has(a.id))
      .slice(0, MAX_VISIBLE_ALERTS);
  }, [alerts, alertsMuted]);

  const connectedTeammates = useMemo(() => {
    return participants
      .filter((p) => p.type === "TEAM" && !p.isSelf)
      .map(participantToTeammate);
  }, [participants]);

  const dismissAlert = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setExpandedAlertId(null);
  }, []);

  const handleRememberThis = useCallback(() => {
    setRememberFlash(true);
    window.setTimeout(() => setRememberFlash(false), 2000);
  }, []);

  useEffect(() => {
    const unsubUtterance = streamingClient.subscribe("utterance", ((
      data: Record<string, unknown>
    ) => {
      const raw = data as unknown as {
        speaker?: Record<string, unknown>;
      };
      if (raw.speaker) {
        const participant = mapSpeakerToParticipant(
          raw.speaker as unknown as Parameters<
            typeof mapSpeakerToParticipant
          >[0]
        );
        setCurrentSpeaker({
          name: participant.name,
          type: participant.type,
        });
        setParticipants((prev) => {
          if (prev.some((p) => p.id === participant.id)) {
            return prev;
          }
          return [...prev, participant];
        });
      }
    }) as IncomingMessageHandler);

    const unsubTopic = streamingClient.subscribe("topic", ((
      data: Record<string, unknown>
    ) => {
      const topic = mapBackendTopicToLive(
        data as unknown as Parameters<typeof mapBackendTopicToLive>[0]
      );
      setCurrentTopic(topic.label);
      const raw = data as Record<string, unknown>;
      const constraints = raw.constraintsMentioned as unknown[];
      if (Array.isArray(constraints)) {
        setConstraintCount((prev) => prev + constraints.length);
      }
    }) as IncomingMessageHandler);

    const unsubLedger = streamingClient.subscribe("ledger", (() => {
      setCommitmentCount((prev) => prev + 1);
    }) as IncomingMessageHandler);

    const unsubAlert = streamingClient.subscribe("alert", ((
      data: Record<string, unknown>
    ) => {
      const alert = extractAlertFromEvent(data);
      if (alert) {
        setAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) {
            return prev;
          }
          return [...prev, alert];
        });
      }
    }) as IncomingMessageHandler);

    const unsubParticipantEvent = streamingClient.subscribe(
      "participant_event",
      ((data: Record<string, unknown>) => {
        if (
          data.type === "participant_list" &&
          Array.isArray(data.participants)
        ) {
          const mapped = (data.participants as Record<string, unknown>[]).map(
            (raw) =>
              mapSpeakerToParticipant(
                raw as unknown as Parameters<typeof mapSpeakerToParticipant>[0]
              )
          );
          setParticipants(mapped);
        }
      }) as IncomingMessageHandler
    );

    return () => {
      unsubUtterance();
      unsubTopic();
      unsubLedger();
      unsubAlert();
      unsubParticipantEvent();
    };
  }, [streamingClient]);

  useEffect(() => {
    if (!params.sessionId) {
      return;
    }
    streamingClient.connect(params.sessionId);
    return () => {
      streamingClient.disconnect();
    };
  }, [streamingClient, params.sessionId]);

  useEffect(() => {
    let unlistenStart: (() => void) | null = null;
    let unlistenEnd: (() => void) | null = null;

    async function attach() {
      unlistenStart = await listen("vad-speech-start", () =>
        setIsMicActive(true)
      );
      unlistenEnd = await listen("vad-speech-end", () => setIsMicActive(false));
    }
    attach();

    return () => {
      unlistenStart?.();
      unlistenEnd?.();
    };
  }, []);

  return {
    clientName: params.clientName,
    commitmentCount,
    connectedTeammates,
    constraintCount,
    currentSpeaker,
    currentTopic,
    dismissAlert,
    expandedAlertId,
    isMicActive,
    meetingTitle: params.meetingTitle,
    rememberFlash,
    sessionId: params.sessionId,
    setAlertsMuted,
    setExpandedAlertId,
    startedAtMs: params.startedAtMs,
    handleRememberThis,
    alertsMuted,
    visibleAlerts,
  };
}
