import {
  DEEPGRAM_DIARIZE_MIC,
  DEEPGRAM_ENDPOINTING_MS,
  DEEPGRAM_NO_DELAY,
  DEEPGRAM_UTTERANCE_END_MS,
} from "../../env";
import { DEFAULT_DG_CONFIG } from "../types";

export const DEEPGRAM_KEEP_ALIVE_INTERVAL_MS = 5000;

export function shouldSendKeepAlive(
  connected: boolean,
  lastAudioSendMs: number,
  nowMs: number
): boolean {
  return (
    connected && nowMs - lastAudioSendMs >= DEEPGRAM_KEEP_ALIVE_INTERVAL_MS
  );
}

export function streamingOptions(channel: number) {
  return {
    ...DEFAULT_DG_CONFIG,
    endpointing: DEEPGRAM_ENDPOINTING_MS,
    utterance_end_ms: DEEPGRAM_UTTERANCE_END_MS,
    ...(DEEPGRAM_NO_DELAY ? { no_delay: "true" } : {}),
    ...(channel === 0 && !DEEPGRAM_DIARIZE_MIC ? { diarize: "false" } : {}),
    reconnectAttempts: 0,
  };
}
