/**
 * dual-channel-session.ts — One Deepgram live session per audio source
 *
 * Host desktop sends binary frames: [tag: u8][pcm: linear16 little-endian mono].
 * Tag 0 = host microphone, tag 1 = system / loopback capture.
 * Each stream gets its own Deepgram connection (mono, no multichannel merge).
 */

import { DeepgramConnection } from "./connection";

/** First byte of each audio frame from the host client */
export const WS_AUDIO_TAG_MIC = 0;
export const WS_AUDIO_TAG_SYS = 1;

export interface DualChannelSession {
  close: () => void;
  sendAudio: (audioBuffer: Buffer) => Promise<void>;
  setAudioStreamStart: (serverAudioStartTs: number) => void;
}

export function createDualChannelSession(
  sessionId: string
): DualChannelSession {
  const mic = new DeepgramConnection(sessionId, WS_AUDIO_TAG_MIC);
  const sys = new DeepgramConnection(sessionId, WS_AUDIO_TAG_SYS);

  return {
    async sendAudio(audioBuffer: Buffer): Promise<void> {
      if (audioBuffer.length < 2) {
        return;
      }
      const tag = audioBuffer[0];
      const pcm = audioBuffer.subarray(1);

      if (tag === WS_AUDIO_TAG_MIC) {
        await mic.sendAudio(pcm);
      } else if (tag === WS_AUDIO_TAG_SYS) {
        await sys.sendAudio(pcm);
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
