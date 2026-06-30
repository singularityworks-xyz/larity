import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapBackendAlertToMeetingAlert } from "../alerts/mapper";
import { useAlertQueue } from "../alerts/use-alert-queue";
import { mapSpeakerToParticipant } from "../meeting-live/mappers";
import type { LiveParticipant } from "../meeting-live/types";
import type { OverlaySpeaker, OverlayTeammate } from "./types";

const WHITESPACE_RE = /\s+/;

function parseOverlayParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("sessionId") ?? "",
    clientName: params.get("clientName") ?? "Client",
    meetingTitle: params.get("meetingTitle") ?? "Live meeting",
    startedAtMs: (() => {
      const raw = Number.parseInt(params.get("startedAt") ?? "", 10);
      return Number.isFinite(raw) ? raw : Date.now();
    })(),
    userId: params.get("userId") ?? "overlay-viewer",
    role: params.get("role") ?? "participant",
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

  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<OverlaySpeaker | null>(
    null
  );
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [constraintCount, setConstraintCount] = useState(0);
  const [commitmentCount, setCommitmentCount] = useState(0);
  const [isMicActive, setIsMicActive] = useState(false);
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [alertsMuted, setAlertsMuted] = useState(false);
  // const [rememberFlash, setRememberFlash] = useState(false);
  const [identityGuesses, setIdentityGuesses] = useState<
    Array<{ id: string; index: string; memberId: string }>
  >([]);
  const [autoExpiryEnabled, setAutoExpiryEnabled] = useState(false);

  const alertQueue = useAlertQueue(999, true, !autoExpiryEnabled);

  const visibleAlerts = useMemo(() => {
    if (alertsMuted) {
      return [];
    }
    return alertQueue.visibleAlerts;
  }, [alertQueue.visibleAlerts, alertsMuted]);

  const connectedTeammates = useMemo(
    () =>
      participants
        .filter((p) => p.type === "TEAM" && !p.isSelf)
        .map(participantToTeammate),
    [participants]
  );

  const dismissAlert = useCallback(
    (id: string) => {
      alertQueue.dismissAlert(id);
      setExpandedAlertId(null);
    },
    [alertQueue]
  );

  // const handleRememberThis = useCallback(() => {
  //   setRememberFlash(true);
  //   window.setTimeout(() => setRememberFlash(false), 2000);
  // }, []);

  const addAlertRef = useRef(alertQueue.addAlert);
  addAlertRef.current = alertQueue.addAlert;

  const seenCommitmentIdsRef = useRef(new Set<string>());

  // Receive forwarded data from the meeting page via Tauri events
  useEffect(() => {
    function handleAlert(payload: Record<string, unknown> | undefined): void {
      if (!payload) {
        return;
      }
      const alert = mapBackendAlertToMeetingAlert(payload);
      if (alert) {
        addAlertRef.current(alert);
      }
    }

    function handleTopic(payload: Record<string, unknown> | undefined): void {
      if (!payload) {
        return;
      }
      const label = extractStringField(payload, "label");
      if (label) {
        setCurrentTopic(label);
      }
      const delta = payload.constraintsMentioned;
      if (typeof delta === "number") {
        setConstraintCount(delta);
      }
    }

    function handleUtterance(
      payload: Record<string, unknown> | undefined
    ): void {
      if (!payload) {
        return;
      }
      const raw = payload as { speaker?: Record<string, unknown> };
      if (!raw.speaker) {
        return;
      }
      const participant = mapSpeakerToParticipant(
        raw.speaker as unknown as Parameters<typeof mapSpeakerToParticipant>[0],
        params.userId
      );
      setCurrentSpeaker({ name: participant.name, type: participant.type });
      setParticipants((prev) => {
        if (prev.some((p) => p.id === participant.id)) {
          return prev;
        }
        return [...prev, participant];
      });
    }

    function handleParticipantEvent(
      payload: Record<string, unknown> | undefined
    ): void {
      if (!payload) {
        return;
      }
      const data = payload as Record<string, unknown>;
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
    }

    function handleSpeakerGuess(
      payload: Record<string, unknown> | undefined
    ): void {
      if (!payload) {
        return;
      }
      const id =
        typeof payload.id === "string" ? payload.id : Date.now().toString();
      const index = typeof payload.index === "string" ? payload.index : null;
      const memberId =
        typeof payload.memberId === "string" ? payload.memberId : null;
      if (index && memberId) {
        setIdentityGuesses((prev) => [...prev, { id, index, memberId }]);
      }
    }

    const unlisten = listen<{
      type: string;
      payload?: Record<string, unknown>;
    }>("overlay-data", (event) => {
      const { type, payload } = event.payload;
      if (!type) {
        return;
      }

      switch (type) {
        case "alert":
          handleAlert(payload);
          break;
        case "topic":
          handleTopic(payload);
          break;
        case "utterance":
          handleUtterance(payload);
          break;
        case "ledger": {
          const commitmentId =
            payload &&
            typeof (payload as Record<string, unknown>).commitmentId ===
              "string"
              ? ((payload as Record<string, unknown>).commitmentId as string)
              : null;
          if (commitmentId && seenCommitmentIdsRef.current.has(commitmentId)) {
            break;
          }
          if (commitmentId) {
            seenCommitmentIdsRef.current.add(commitmentId);
          }
          setCommitmentCount((prev) => prev + 1);
          break;
        }
        case "participant_event":
          handleParticipantEvent(payload);
          break;
        case "speaker_identity_guessed":
          handleSpeakerGuess(payload);
          break;
        default:
          break;
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [params.userId]);

  useEffect(() => {
    let unlistenStart: (() => void) | null = null;
    let unlistenEnd: (() => void) | null = null;
    let unlistenAmp: (() => void) | null = null;

    async function attach() {
      unlistenStart = await listen("vad-speech-start", () =>
        setIsMicActive(true)
      );
      unlistenEnd = await listen("vad-speech-end", () => {
        setIsMicActive(false);
      });
      unlistenAmp = await listen<number>("raw-mic-amplitude", (e) => {
        setMicAmplitude(e.payload);
      });
    }
    attach();

    return () => {
      unlistenStart?.();
      unlistenEnd?.();
      unlistenAmp?.();
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
    micAmplitude,
    meetingTitle: params.meetingTitle,
    // rememberFlash,
    role: params.role,
    sessionId: params.sessionId,
    setAlertsMuted,
    setExpandedAlertId,
    startedAtMs: params.startedAtMs,
    // handleRememberThis,
    alertsMuted,
    visibleAlerts,
    pendingCount: alertQueue.pendingCount,
    exitingIds: alertQueue.exitingIds,
    identityGuesses,
    setIdentityGuesses,
    autoExpiryEnabled,
    setAutoExpiryEnabled,
  };
}
