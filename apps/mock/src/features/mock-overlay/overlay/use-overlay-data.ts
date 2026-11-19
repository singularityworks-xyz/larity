import { useCallback, useEffect, useState } from "react";
import type { MeetingAlert } from "../alerts/types";
import type { OverlaySpeaker, OverlayTeammate } from "./types";

export function useOverlayData() {
  const [startedAtMs, setStartedAtMs] = useState(Date.now());
  const [visibleAlerts, setVisibleAlerts] = useState<MeetingAlert[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [autoExpiryEnabled, setAutoExpiryEnabled] = useState(true);
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [isMicActive] = useState(true);

  // Mocks
  const clientName = "Acme Corp";
  const meetingTitle = "Q3 Product Demo";
  const sessionId = "mock-session-123";
  const role = "host";
  const pendingCount = 0;

  const connectedTeammates: OverlayTeammate[] = [
    { id: "1", name: "Alice", initials: "AL" },
    { id: "2", name: "Bob", initials: "BO" },
  ];
  const constraintCount = 2;
  const currentSpeaker: OverlaySpeaker = {
    name: "Client (John)",
    type: "EXTERNAL",
  };
  const currentTopic = "Budget Discussion";

  const identityGuesses: unknown[] = [];
  const setIdentityGuesses = () => {
    // Mock no-op for demo identity guesses
  };

  const dismissAlert = useCallback(
    (id: string) => {
      setExitingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (expandedAlertId === id) {
          setExpandedAlertId(null);
        }
      }, 300); // match fade out duration
    },
    [expandedAlertId]
  );

  const resetApp = useCallback(() => {
    setStartedAtMs(Date.now());
    setVisibleAlerts([]);
    setExitingIds(new Set());
    setExpandedAlertId(null);
  }, []);

  useEffect(() => {
    // Reference startedAtMs so the linter is happy and the effect re-runs when resetApp triggers
    const _timerResetKey = startedAtMs;
    // Fire alerts 20 seconds after start
    const timer = setTimeout(() => {
      const alert1: MeetingAlert = {
        id: "alert-1",
        category: "information_risk",
        severity: "critical",
        triggerUtteranceId: "u1",
        speakerName: "Bob",
        speakerType: "TEAM",
        topicId: "t1",
        timestamp: Date.now(),
        title: "Information Risk",
        message: "Sensitive database credentials exposed on the meeting audio.",
        routing: "both",
        isShared: true,
        triggerTier: 4,
        confidence: 0.95,
        suggestion:
          "Rotate the staging database password immediately after the call.",
        evidence: {
          utterance:
            "Just use the staging database password which is AdminPass123! to run the script.",
          reasoning:
            "The speaker disclosed a database password on the call, violating standard credential handling policies.",
        },
      } as unknown as MeetingAlert;

      const alert2: MeetingAlert = {
        id: "alert-2",
        category: "risky_commitment",
        severity: "high",
        triggerUtteranceId: "u2",
        speakerName: "Alice",
        speakerType: "TEAM",
        topicId: "t1",
        timestamp: Date.now(),
        title: "Risky Commitment",
        message:
          "Teammate promised custom integration within current sprint without engineering validation.",
        routing: "personal",
        isShared: false,
        triggerTier: 4,
        confidence: 0.88,
        suggestion:
          "Clarify that we will need to confirm the database schema requirements first.",
        evidence: {
          utterance:
            "We can easily sync all legacy client databases by next Tuesday.",
          reasoning:
            "The speaker made an unconditional commitment to complete a complex database synchronization task within one week without verifying dependencies.",
        },
      } as unknown as MeetingAlert;

      setVisibleAlerts([alert2]);

      setTimeout(() => {
        setVisibleAlerts((prev) => [...prev, alert1]);
      }, 1000);
    }, 19_000);

    return () => clearTimeout(timer);
  }, [startedAtMs]);

  // Simulate mic amplitude
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMicActive) {
        setMicAmplitude(Math.random() * 0.4 + 0.1);
      } else {
        setMicAmplitude(0);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isMicActive]);

  return {
    startedAtMs,
    visibleAlerts,
    exitingIds,
    expandedAlertId,
    setExpandedAlertId,
    alertsMuted,
    setAlertsMuted,
    autoExpiryEnabled,
    setAutoExpiryEnabled,
    dismissAlert,
    micAmplitude,
    isMicActive,
    clientName,
    meetingTitle,
    sessionId,
    role,
    pendingCount,
    connectedTeammates,
    constraintCount,
    currentSpeaker,
    currentTopic,
    identityGuesses,
    setIdentityGuesses,
    resetApp,
  };
}
