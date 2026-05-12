import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioStreamingClient,
  type IncomingMessageHandler,
} from "../../services/audio-streaming";
import { mapBackendAlertToMeetingAlert } from "../alerts/mapper";
import { useAlertQueue } from "../alerts/use-alert-queue";
import { mapSpeakerToParticipant } from "../meeting-live/mappers";
import type { LiveParticipant } from "../meeting-live/types";
import type { OverlaySpeaker, OverlayTeammate } from "./types";

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:9001";
const WHITESPACE_RE = /\s+/;

function parseOverlayParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("sessionId") ?? "",
    role: params.get("role") ?? "participant",
    clientName: params.get("clientName") ?? "Client",
    meetingTitle: params.get("meetingTitle") ?? "Live meeting",
    startedAtMs: (() => {
      const raw = Number.parseInt(params.get("startedAt") ?? "", 10);
      return Number.isFinite(raw) ? raw : Date.now();
    })(),
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

// function extractBooleanField(
//   data: Record<string, unknown>,
//   ...keys: string[]
// ): boolean | null {
//   for (const key of keys) {
//     if (typeof data[key] === "boolean") {
//       return data[key] as boolean;
//     }
//   }
//   return null;
// }

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
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [constraintCount, setConstraintCount] = useState(0);
  const [commitmentCount, setCommitmentCount] = useState(0);
  const [isMicActive, setIsMicActive] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [rememberFlash, setRememberFlash] = useState(false);

  const alertQueue = useAlertQueue();

  const visibleAlerts = useMemo(() => {
    if (alertsMuted) {
      return [];
    }
    return alertQueue.visibleAlerts;
  }, [alertQueue.visibleAlerts, alertsMuted]);

  const connectedTeammates = useMemo(() => {
    return participants
      .filter((p) => p.type === "TEAM" && !p.isSelf)
      .map(participantToTeammate);
  }, [participants]);

  const dismissAlert = useCallback(
    (id: string) => {
      alertQueue.dismissAlert(id);
      setExpandedAlertId(null);
    },
    [alertQueue]
  );

  const handleRememberThis = useCallback(() => {
    setRememberFlash(true);
    window.setTimeout(() => setRememberFlash(false), 2000);
  }, []);

  useEffect(() => {
    const unsubWildcard = import.meta.env.DEV
      ? streamingClient.subscribe("*", (data) => {
          console.debug("[overlay] ws message:", data);
        })
      : undefined;

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
          >[0],
          params.userId
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
      const label =
        extractStringField(data, "label", "name", "title") ??
        extractStringField(data, "summary");
      if (label) {
        setCurrentTopic(label);
      }
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
      const alert = mapBackendAlertToMeetingAlert(data);
      if (alert) {
        alertQueue.addAlert(alert);
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
                raw as unknown as Parameters<typeof mapSpeakerToParticipant>[0],
                params.userId
              )
          );
          setParticipants(mapped);
        }
      }) as IncomingMessageHandler
    );

    return () => {
      unsubWildcard?.();
      unsubUtterance();
      unsubTopic();
      unsubLedger();
      unsubAlert();
      unsubParticipantEvent();
    };
  }, [streamingClient, params.userId, alertQueue.addAlert]);

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

  const displaySpeaker = useMemo(() => {
    if (isMicActive) {
      return {
        name: params.clientName,
        type: "TEAM",
      } as OverlaySpeaker;
    }
    return currentSpeaker;
  }, [isMicActive, currentSpeaker, params.clientName]);

  return {
    clientName: params.clientName,
    commitmentCount,
    connectedTeammates,
    constraintCount,
    currentSpeaker: displaySpeaker,
    currentTopic,
    dismissAlert,
    expandedAlertId,
    isMicActive,
    meetingTitle: params.meetingTitle,
    rememberFlash,
    role: params.role,
    sessionId: params.sessionId,
    setAlertsMuted,
    setExpandedAlertId,
    startedAtMs: params.startedAtMs,
    handleRememberThis,
    alertsMuted,
    visibleAlerts,
  };
}
