import { emitTo } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { mapBackendAlertToMeetingAlert } from "../../alerts/mapper";
import type { MeetingAlert } from "../../alerts/types";
import type { AudioStreamingClient } from "../capture/audio-streaming";
import type { VadManager } from "../capture/vad";
import {
  isUtteranceTopicDelta,
  mapBackendCommitmentToLive,
  mapBackendTopicToLive,
  mapBackendUtteranceToLive,
  mapSpeakerToParticipant,
} from "../mappers";
import {
  pendingOverlapsSttRange,
  upsertLiveUtterance,
} from "../transcript-state";
import type {
  LiveCommitment,
  LiveParticipant,
  LivePendingUtterance,
  LiveTopic,
  LiveUtterance,
} from "../types";
import { subscribeToMeetingEvents } from "./meeting-event-subscriptions";

interface SystemEvent {
  code: string;
  eventId: string;
  message: string;
  severity: "info" | "warning" | "error";
  source: "deepgram" | "generalcompute" | "gemini";
  timestamp: number;
}

interface IdentityGuess {
  id: string;
  index: string;
  memberId: string;
}

interface UseMeetingLiveEventsOptions {
  addAlert: (alert: MeetingAlert) => void;
  sessionId: string;
  streamingClient: AudioStreamingClient;
  userId: string;
  vadManager: VadManager;
}

const WS_TIMING_RING_SIZE = 30;

function pushTimingSample(ring: number[], valueMs: number): void {
  ring.push(valueMs);
  if (ring.length > WS_TIMING_RING_SIZE) {
    ring.splice(0, ring.length - WS_TIMING_RING_SIZE);
  }
}

function averageTiming(ring: number[]): number | null {
  if (ring.length === 0) {
    return null;
  }
  return ring.reduce((total, value) => total + value, 0) / ring.length;
}

function toSystemEvent(data: Record<string, unknown>): SystemEvent {
  return {
    eventId:
      typeof data.eventId === "string"
        ? data.eventId
        : Math.random().toString(),
    source:
      typeof data.source === "string"
        ? (data.source as SystemEvent["source"])
        : "deepgram",
    severity:
      typeof data.severity === "string"
        ? (data.severity as SystemEvent["severity"])
        : "warning",
    code: typeof data.code === "string" ? data.code : "unknown",
    message: typeof data.message === "string" ? data.message : "",
    timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
  };
}

function upsertSystemEvent(
  events: SystemEvent[],
  incoming: SystemEvent
): SystemEvent[] {
  const index = events.findIndex((event) => event.code === incoming.code);
  if (index === -1) {
    return [...events, incoming];
  }
  const updated = [...events];
  updated[index] = incoming;
  return updated;
}

export function useMeetingLiveEvents({
  addAlert,
  sessionId,
  streamingClient,
  userId,
  vadManager,
}: UseMeetingLiveEventsOptions) {
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
  const [constraintCount, setConstraintCount] = useState(0);
  const [ambientTopic, setAmbientTopic] = useState<string | null>(null);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [postProcessingMeetingId, setPostProcessingMeetingId] = useState<
    string | null
  >(null);
  const [identityGuesses, setIdentityGuesses] = useState<IdentityGuess[]>([]);
  const [wsPartialMs, setWsPartialMs] = useState<number | null>(null);
  const [wsFinalMs, setWsFinalMs] = useState<number | null>(null);
  const wsTimingRef = useRef<{ final: number[]; partial: number[] }>({
    final: [],
    partial: [],
  });
  const addAlertRef = useRef(addAlert);
  addAlertRef.current = addAlert;

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
      .catch(() => undefined);

    return () => {
      vadManager.destroy();
    };
  }, [sessionId, streamingClient, vadManager]);

  useEffect(
    () =>
      subscribeToMeetingEvents(streamingClient, {
        utterance: (data) => {
          const raw = data as unknown as {
            duration?: number;
            retracted?: boolean;
            speaker?: Record<string, unknown>;
            startOffset?: number;
            utteranceId: string;
          };

          if (raw.retracted) {
            setUtterances((previous) =>
              previous.filter((utterance) => utterance.id !== raw.utteranceId)
            );
            return;
          }

          const utterance = mapBackendUtteranceToLive(
            data as unknown as Parameters<typeof mapBackendUtteranceToLive>[0]
          );
          setUtterances((previous) => upsertLiveUtterance(previous, utterance));
          if (
            typeof raw.startOffset === "number" &&
            typeof raw.duration === "number"
          ) {
            setPendingFinals((previous) =>
              previous.filter(
                (pending) =>
                  !pendingOverlapsSttRange(
                    pending,
                    raw.startOffset as number,
                    raw.duration as number
                  )
              )
            );
          }
          setParticipants((previous) => {
            if (!raw.speaker) {
              return previous;
            }
            const participant = mapSpeakerToParticipant(
              raw.speaker as unknown as Parameters<
                typeof mapSpeakerToParticipant
              >[0],
              userId
            );
            const index = previous.findIndex(
              (item) => item.id === participant.id
            );
            if (index >= 0) {
              const updated = [...previous];
              updated[index] = participant;
              return updated;
            }
            return [...previous, participant];
          });
          if (raw.speaker) {
            emitTo("meeting-overlay", "overlay-data", {
              type: "utterance",
              payload: { speaker: raw.speaker },
            }).catch((error) =>
              console.warn("overlay-data utterance emit failed:", error)
            );
          }
        },
        topic: (data) => {
          if (isUtteranceTopicDelta(data)) {
            setUtterances((previous) =>
              previous.map((utterance) =>
                utterance.id === data.utteranceId
                  ? { ...utterance, topicId: data.topicId }
                  : utterance
              )
            );
            return;
          }

          const topic = mapBackendTopicToLive(
            data as unknown as Parameters<typeof mapBackendTopicToLive>[0]
          );
          setTopics((previous) => {
            const index = previous.findIndex((item) => item.id === topic.id);
            if (index >= 0) {
              const updated = [...previous];
              updated[index] = topic;
              return updated;
            }
            return [...previous, topic];
          });
          setActiveTopicId((previous) =>
            previous === topic.id ? previous : topic.id
          );
          setAmbientTopic(topic.label);
          const mentioned = (
            data as unknown as { constraintsMentioned?: unknown[] }
          ).constraintsMentioned;
          if (Array.isArray(mentioned) && mentioned.length > 0) {
            setConstraintCount((previous) => previous + mentioned.length);
          }
          emitTo("meeting-overlay", "overlay-data", {
            type: "topic",
            payload: {
              label: topic.label,
              constraintsMentioned: Array.isArray(mentioned)
                ? mentioned.length
                : 0,
            },
          }).catch((error) =>
            console.warn("overlay-data topic emit failed:", error)
          );
        },
        ledger: (data) => {
          const raw = data as unknown as {
            commitment?: Record<string, unknown>;
          };
          if (!raw.commitment) {
            return;
          }
          const commitment = mapBackendCommitmentToLive(
            raw.commitment as unknown as Parameters<
              typeof mapBackendCommitmentToLive
            >[0]
          );
          setCommitments((previous) => {
            const index = previous.findIndex(
              (item) => item.id === commitment.id
            );
            if (index >= 0) {
              const updated = [...previous];
              updated[index] = commitment;
              return updated;
            }
            return [...previous, commitment];
          });
          setUtterances((previous) =>
            previous.map((utterance) =>
              utterance.id === commitment.sourceUtteranceId
                ? { ...utterance, isCommitment: true }
                : utterance
            )
          );
          emitTo("meeting-overlay", "overlay-data", {
            type: "ledger",
            payload: { commitmentId: commitment.id },
          }).catch((error) =>
            console.warn("overlay-data ledger emit failed:", error)
          );
        },
        stt_partial: (data) => {
          recordReceiveTiming(wsTimingRef.current.partial, streamingClient);
          const transcript =
            typeof data.transcript === "string" ? data.transcript.trim() : "";
          if (!transcript) {
            return;
          }
          setLivePartial({
            text: transcript,
            ts: typeof data.ts === "number" ? data.ts : Date.now(),
            channel: typeof data.channel === "number" ? data.channel : 0,
          });
        },
        stt_final: (data) => {
          recordReceiveTiming(wsTimingRef.current.final, streamingClient);
          setLivePartial(null);
          const transcript =
            typeof data.transcript === "string" ? data.transcript.trim() : "";
          if (!transcript) {
            return;
          }
          const channel = typeof data.channel === "number" ? data.channel : 0;
          const startSec = typeof data.start === "number" ? data.start : 0;
          const durationSec =
            typeof data.duration === "number" ? data.duration : 0;
          const ts = typeof data.ts === "number" ? data.ts : Date.now();
          const key = `${channel}:${startSec.toFixed(3)}`;
          setPendingFinals((previous) => [
            ...previous.filter((pending) => pending.key !== key),
            { key, text: transcript, channel, startSec, durationSec, ts },
          ]);
        },
        alert: (data) => {
          const alert = mapBackendAlertToMeetingAlert(data);
          if (alert) {
            addAlertRef.current(alert);
            emitTo("meeting-overlay", "overlay-data", {
              type: "alert",
              payload: alert,
            }).catch((error) =>
              console.warn("overlay-data alert emit failed:", error)
            );
          }
        },
        participant_event: (data) => {
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
          }).catch((error) =>
            console.warn("overlay-data participant_event emit failed:", error)
          );
        },
        meeting_processed: (data) => {
          if (typeof data.meetingId === "string") {
            setPostProcessingMeetingId(data.meetingId);
          }
        },
        speaker_identity_guessed: (data) => {
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
          setIdentityGuesses((previous) => [
            ...previous,
            { id, index, memberId },
          ]);
          emitTo("meeting-overlay", "overlay-data", {
            type: "speaker_identity_guessed",
            payload: { id, index, memberId },
          }).catch((error) =>
            console.warn(
              "overlay-data speaker_identity_guessed emit failed:",
              error
            )
          );
        },
        system_event: (data) => {
          const event = toSystemEvent(data);
          setSystemEvents((previous) => upsertSystemEvent(previous, event));

          if (event.severity !== "error") {
            setTimeout(() => {
              setSystemEvents((previous) =>
                previous.filter((item) => item.eventId !== event.eventId)
              );
            }, 8000);
          }
        },
      }),
    [streamingClient, userId]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPendingFinals((previous) => {
        const active = previous.filter((pending) => now - pending.ts <= 5000);
        return active.length === previous.length ? previous : active;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const syncLatencyMetrics = useCallback(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    setWsPartialMs((previous) => {
      const next = averageTiming(wsTimingRef.current.partial);
      return next === previous ? previous : next;
    });
    setWsFinalMs((previous) => {
      const next = averageTiming(wsTimingRef.current.final);
      return next === previous ? previous : next;
    });
  }, []);

  const dismissSystemEvent = useCallback((eventId: string) => {
    setSystemEvents((previous) =>
      previous.filter((event) => event.eventId !== eventId)
    );
  }, []);

  const dismissIdentityGuess = useCallback((id: string) => {
    setIdentityGuesses((previous) =>
      previous.filter((guess) => guess.id !== id)
    );
  }, []);

  return {
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
  };
}

function recordReceiveTiming(
  ring: number[],
  streamingClient: AudioStreamingClient
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const receivedAt = streamingClient.getLastWsRecvPerf();
  if (receivedAt > 0) {
    pushTimingSample(ring, performance.now() - receivedAt);
  }
}
