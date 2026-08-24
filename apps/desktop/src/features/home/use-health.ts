import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { CONTROL_URL } from "../../lib/env";

export interface HealthState {
  audioDeviceAvailable: boolean;
  lastSync: Date | null;
  serverOnline: boolean;
}

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({
    serverOnline: false,
    audioDeviceAvailable: false,
    lastSync: null,
  });

  useEffect(() => {
    let audioInterval: ReturnType<typeof setInterval> | undefined;
    let serverInterval: ReturnType<typeof setInterval> | undefined;

    async function checkServer() {
      try {
        const res = await fetch(`${CONTROL_URL}/health`, { method: "GET" });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const now = new Date();
        setState((prev) => ({
          ...prev,
          serverOnline: true,
          lastSync: now,
        }));
      } catch {
        setState((prev) =>
          prev.serverOnline ? { ...prev, serverOnline: false } : prev
        );
      }
    }

    async function checkAudio() {
      try {
        const devices = await invoke<
          { name: string; deviceId: string; isLoopback: boolean }[]
        >("audio_capture_list_devices");
        const available = devices.length > 0;
        setState((prev) =>
          prev.audioDeviceAvailable === available
            ? prev
            : { ...prev, audioDeviceAvailable: available }
        );
      } catch {
        setState((prev) =>
          prev.audioDeviceAvailable
            ? { ...prev, audioDeviceAvailable: false }
            : prev
        );
      }
    }

    checkServer();
    checkAudio();

    serverInterval = setInterval(checkServer, 30_000);
    audioInterval = setInterval(checkAudio, 10_000);

    return () => {
      clearInterval(serverInterval);
      clearInterval(audioInterval);
    };
  }, []);

  return state;
}
