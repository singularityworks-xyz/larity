/**
 * vad.ts — Local VAD Processor
 */
import { MicVAD } from "@ricky0123/vad-web";

export interface VadCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
}

export class VadManager {
  private micVad: MicVAD | null = null;

  async start(callbacks: VadCallbacks): Promise<void> {
    try {
      // Create and start VAD listening to the default microphone
      this.micVad = await MicVAD.new({
        onSpeechStart: () => {
          callbacks.onSpeechStart();
        },
        onSpeechEnd: () => {
          callbacks.onSpeechEnd();
        },
        // We can tune these for better responsiveness
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.8 - 0.15,
        preSpeechPadMs: 150,
        minSpeechMs: 100,
      });

      this.micVad.start();
      console.log("[VadManager] VAD initialized and started successfully.");
    } catch (err) {
      console.warn(
        "[VadManager] Failed to start VAD. Microphone might be denied or unavailable:",
        err
      );
      // Fail silently without crashing the app
      this.micVad = null;
    }
  }

  destroy(): void {
    if (this.micVad) {
      this.micVad.pause();
      this.micVad = null;
      console.log("[VadManager] VAD destroyed.");
    }
  }
}
