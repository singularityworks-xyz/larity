import { Channel, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioStatusSnapshot,
  type AudioStreamingClient,
  parseRawAudioFrame,
} from "./audio-streaming";

interface AudioDevice {
  id: string;
  is_default: boolean;
  name: string;
}

export function useAudioCapture({
  role,
  sessionId,
  setWarning,
  streamingClient,
}: {
  role: "host" | "participant";
  sessionId: string;
  setWarning: (warning: string) => void;
  streamingClient: AudioStreamingClient;
}) {
  const [isStreamActive, setIsStreamActive] = useState(true);

  const [status, setStatus] = useState<AudioStatusSnapshot | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [framesDropped, setFramesDropped] = useState(0);
  const [lastTs, setLastTs] = useState<number>(0);
  // Active raw-audio Channel (P4.1). Created per startCapture; cleared on
  // stop/unmount so a stale channel can never feed a new session.
  const audioChannelRef = useRef<Channel<ArrayBuffer> | null>(null);
  // Frame counters shared between the channel handler and the 1 Hz metrics
  // sync below — the handler never calls setState per frame (P6 territory).
  const audioFrameCountsRef = useRef({
    dropped: 0,
    lastTs: 0,
    received: 0,
    sent: 0,
  });
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [sysDeviceId, setSysDeviceId] = useState<string | null>(null);

  const clearAudioChannel = useCallback(() => {
    audioChannelRef.current = null;
  }, []);

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
  }, [setWarning]);

  const startCapture = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    try {
      streamingClient.connect(sessionId);
      // P4.1: raw frames arrive as ArrayBuffer over this Channel — no
      // base64/atob, no per-frame JSON envelope, no sessionId per frame.
      const audioChannel = new Channel<ArrayBuffer>();
      audioChannel.onmessage = (buffer) => {
        const frame = parseRawAudioFrame(buffer);
        if (!frame) {
          return;
        }
        // P4.9: no setState, no getMetrics per frame — the 1 Hz sync below
        // picks up counters and warning changes.
        const counts = audioFrameCountsRef.current;
        counts.received += 1;
        counts.lastTs = frame.ts;
        streamingClient.handleRawAudioFrame(frame, sessionId);
      };
      audioChannelRef.current = audioChannel;
      await invoke("audio_capture_start", {
        sessionId,
        micDeviceId: micDeviceId || null,
        sysDeviceId: sysDeviceId || null,
        role,
        onAudio: audioChannel,
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
    setWarning,
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
    } finally {
      clearAudioChannel();
    }
  }, [clearAudioChannel, refreshStatus, setWarning]);

  useEffect(() => {
    if (role === "host") {
      invoke<AudioDevice[]>("audio_capture_list_devices")
        .then((list) => setDevices(list))
        .catch((e) => setWarning(`Failed to list devices: ${String(e)}`));
    }
  }, [role, setWarning]);

  const syncFrameMetrics = useCallback(() => {
    const counts = audioFrameCountsRef.current;
    const metrics = streamingClient.getMetrics();
    counts.sent = metrics.framesSent;
    counts.dropped = metrics.framesDropped;
    setFramesReceived(counts.received);
    setFramesSent(counts.sent);
    setFramesDropped(counts.dropped);
    setLastTs(counts.lastTs);
  }, [streamingClient]);

  return {
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
  };
}
