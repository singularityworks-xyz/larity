import { describe, expect, test } from "bun:test";
import {
  DEEPGRAM_DIARIZE_MIC,
  DEEPGRAM_ENDPOINTING_MS,
  DEEPGRAM_NO_DELAY,
  DEEPGRAM_UTTERANCE_END_MS,
} from "./env";

describe("STT Deepgram tuning defaults (P5.7)", () => {
  test("defaults preserve current behavior until measured", () => {
    expect(process.env.DEEPGRAM_ENDPOINTING_MS).toBeUndefined();
    expect(DEEPGRAM_ENDPOINTING_MS).toBe("450");
    expect(process.env.DEEPGRAM_UTTERANCE_END_MS).toBeUndefined();
    expect(DEEPGRAM_UTTERANCE_END_MS).toBe("1000");
    expect(process.env.DEEPGRAM_NO_DELAY).toBeUndefined();
    expect(DEEPGRAM_NO_DELAY).toBe(false);
    expect(process.env.DEEPGRAM_DIARIZE_MIC).toBeUndefined();
    expect(DEEPGRAM_DIARIZE_MIC).toBe(true);
  });
});
