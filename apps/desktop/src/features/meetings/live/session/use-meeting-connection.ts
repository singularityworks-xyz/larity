import { type Dispatch, type SetStateAction, useEffect } from "react";
import { closeOverlayWindow, createOverlayWindow } from "../../overlay/window";
import type { AudioStreamingClient } from "../capture/audio-streaming";

interface UseMeetingConnectionOptions {
  allowNameCustomization: boolean;
  clearAudioChannel: () => void;
  clientDisplayName: string;
  configuredName: string | null;
  meetingDisplayTitle: string;
  meetingStartedAtMs: number;
  onMetricsSync: () => void;
  refreshStatus: () => Promise<void>;
  role: "host" | "participant";
  sessionId: string;
  setWarning: Dispatch<SetStateAction<string>>;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  streamingClient: AudioStreamingClient;
  syncFrameMetrics: () => void;
  userId: string;
  wsBaseUrl: string;
}

export function useMeetingConnection({
  allowNameCustomization,
  clearAudioChannel,
  clientDisplayName,
  configuredName,
  meetingDisplayTitle,
  meetingStartedAtMs,
  onMetricsSync,
  refreshStatus,
  role,
  sessionId,
  setWarning,
  startCapture,
  stopCapture,
  streamingClient,
  syncFrameMetrics,
  userId,
  wsBaseUrl,
}: UseMeetingConnectionOptions): void {
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    if (allowNameCustomization && configuredName === null) {
      return;
    }

    streamingClient.connect(sessionId);
    refreshStatus().catch(() => undefined);
    startCapture().catch(() => undefined);

    createOverlayWindow({
      sessionId,
      role,
      clientName: clientDisplayName,
      meetingTitle: meetingDisplayTitle,
      startedAt: meetingStartedAtMs,
      wsBaseUrl,
      userId,
    }).catch(() => undefined);

    let mounted = true;
    let lastSyncedWarning = streamingClient.getWarning();
    const metricsSyncInterval = setInterval(() => {
      if (!mounted) {
        return;
      }
      syncFrameMetrics();
      const clientWarning = streamingClient.getWarning();
      if (clientWarning !== lastSyncedWarning) {
        lastSyncedWarning = clientWarning;
        setWarning(clientWarning);
      }
      onMetricsSync();
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(metricsSyncInterval);
      clearAudioChannel();
      closeOverlayWindow().catch(() => undefined);
      stopCapture().catch(() => undefined);
      streamingClient.disconnect();
    };
  }, [
    allowNameCustomization,
    clearAudioChannel,
    clientDisplayName,
    configuredName,
    meetingDisplayTitle,
    meetingStartedAtMs,
    onMetricsSync,
    refreshStatus,
    role,
    sessionId,
    setWarning,
    startCapture,
    stopCapture,
    streamingClient,
    syncFrameMetrics,
    userId,
    wsBaseUrl,
  ]);
}
