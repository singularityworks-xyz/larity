import { DeepgramConnection } from "./connection";

export const WS_AUDIO_TAG_MIC = 0;
export const WS_AUDIO_TAG_SYS = 1;

export interface DualChannelSession {
  close: () => void;
  preconnect: () => void;
  sendAudio: (audioBuffer: Buffer) => void;
  setAudioStreamStart: (serverAudioStartTs: number) => void;
}

export function createDualChannelSession(
  sessionId: string
): DualChannelSession {
  const mic = new DeepgramConnection(sessionId, WS_AUDIO_TAG_MIC);
  const sys = new DeepgramConnection(sessionId, WS_AUDIO_TAG_SYS);

  return {
    preconnect(): void {
      mic.preconnect();
      sys.preconnect();
    },

    sendAudio(audioBuffer: Buffer): void {
      if (audioBuffer.length < 2) {
        return;
      }
      const tag = audioBuffer[0];
      const pcm = audioBuffer.subarray(1);

      if (tag === WS_AUDIO_TAG_MIC) {
        mic.sendAudio(pcm);
      } else if (tag === WS_AUDIO_TAG_SYS) {
        sys.sendAudio(pcm);
      }
    },

    setAudioStreamStart(serverAudioStartTs: number): void {
      mic.setAudioStreamStart(serverAudioStartTs);
      sys.setAudioStreamStart(serverAudioStartTs);
    },

    close(): void {
      mic.close();
      sys.close();
    },
  };
}
