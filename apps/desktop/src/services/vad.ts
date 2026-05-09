import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface VadCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
}

export class VadManager {
  private unlistenStart: (() => void) | null = null;
  private unlistenEnd: (() => void) | null = null;

  async start(callbacks: VadCallbacks): Promise<void> {
    this.unlistenStart = await listen("vad-speech-start", () =>
      callbacks.onSpeechStart()
    );
    this.unlistenEnd = await listen("vad-speech-end", () =>
      callbacks.onSpeechEnd()
    );
    try {
      await invoke("vad_start");
    } catch {
      this.unlistenStart?.();
      this.unlistenEnd?.();
      this.unlistenStart = null;
      this.unlistenEnd = null;
      throw new Error("VAD start failed");
    }
  }

  destroy(): void {
    invoke("vad_stop").catch(() => {
      // best effort
    });
    this.unlistenStart?.();
    this.unlistenEnd?.();
    this.unlistenStart = null;
    this.unlistenEnd = null;
  }
}
