import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface VadCallbacks {
  onAmplitude?: (rms: number) => void;
  onSpeechEnd: () => void;
  onSpeechStart: () => void;
}

export class VadManager {
  private unlistenStart: (() => void) | null = null;
  private unlistenEnd: (() => void) | null = null;
  private unlistenAmplitude: (() => void) | null = null;
  private amplitudeAcquired = false;

  async start(callbacks: VadCallbacks): Promise<void> {
    this.unlistenStart = await listen("vad-speech-start", () =>
      callbacks.onSpeechStart()
    );
    this.unlistenEnd = await listen("vad-speech-end", () =>
      callbacks.onSpeechEnd()
    );
    if (callbacks.onAmplitude) {
      const onAmp = callbacks.onAmplitude;
      this.unlistenAmplitude = await listen<number>("vad-amplitude", (e) =>
        onAmp(e.payload)
      );
      // P4.4: tell Rust a listener exists so vad-amplitude emits flow
      // (≤15 Hz). Best-effort — a failure only means silence, not breakage.
      await invoke("vad_set_amplitude_listener", { enabled: true }).then(
        () => {
          this.amplitudeAcquired = true;
        },
        () => undefined
      );
    }
    try {
      await invoke("vad_start");
    } catch {
      this.unlistenStart?.();
      this.unlistenEnd?.();
      this.unlistenAmplitude?.();
      this.unlistenStart = null;
      this.unlistenEnd = null;
      this.unlistenAmplitude = null;
      if (this.amplitudeAcquired) {
        this.amplitudeAcquired = false;
        invoke("vad_set_amplitude_listener", { enabled: false }).catch(() => {
          // best effort
        });
      }
      throw new Error("VAD start failed");
    }
  }

  destroy(): void {
    invoke("vad_stop").catch(() => {
      // best effort
    });
    if (this.amplitudeAcquired) {
      this.amplitudeAcquired = false;
      invoke("vad_set_amplitude_listener", { enabled: false }).catch(() => {
        // best effort
      });
    }
    this.unlistenStart?.();
    this.unlistenEnd?.();
    this.unlistenAmplitude?.();
    this.unlistenStart = null;
    this.unlistenEnd = null;
    this.unlistenAmplitude = null;
  }
}
