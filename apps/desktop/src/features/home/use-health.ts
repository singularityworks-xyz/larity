import { useEffect, useState } from "react";

export interface HealthState {
  serverOnline: boolean;
  audioDeviceAvailable: boolean;
  lastSync: Date | null;
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
        const ctrlUrl =
          import.meta.env.VITE_CONTROL_URL ?? "http://localhost:3000";
        await fetch(`${ctrlUrl}/health`, { method: "GET" });
        setState((prev) => ({
          ...prev,
          serverOnline: true,
          lastSync: new Date(),
        }));
      } catch {
        setState((prev) => ({ ...prev, serverOnline: false }));
      }
    }

    async function checkAudio() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const devices = await invoke<
          { name: string; deviceId: string; isLoopback: boolean }[]
        >("audio_capture_list_devices");
        setState((prev) => ({
          ...prev,
          audioDeviceAvailable: devices.length > 0,
        }));
      } catch {
        setState((prev) => ({ ...prev, audioDeviceAvailable: false }));
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
