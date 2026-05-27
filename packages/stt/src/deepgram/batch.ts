import { createSttLogger } from "../logger";
import { getDeepgramClient } from "./client";

const log = createSttLogger("dg-batch");

export interface BatchUtterance {
  start: number;
  end: number;
  text: string;
  speaker: number;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: number;
  }>;
}

export interface BatchTranscriptionResult {
  utterances: BatchUtterance[];
}

/**
 * Transcribe an audio buffer using Deepgram's Prerecorded batch API
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType = "audio/x-pcm"
): Promise<BatchTranscriptionResult> {
  const deepgram = getDeepgramClient();

  log.info(
    { bufferSize: buffer.length, mimeType },
    "Sending batch STT request to Deepgram"
  );

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    buffer,
    {
      model: "nova-3",
      diarize: true,
      diarize_model: "latest",
      smart_format: true,
      utterances: true,
      // For pcm16, we need to supply sample_rate and encoding if not defined by the mimeType.
      // But standard REST API accepts raw PCM if we pass encoding and sample_rate.
      // Since ch0.pcm16/ch1.pcm16 are 16kHz linear16 PCM, let's specify those parameter options.
      encoding: "linear16",
      sample_rate: 16_000,
    }
  );

  if (error) {
    log.error({ err: error }, "Deepgram batch STT failed");
    throw error;
  }

  if (!result) {
    throw new Error("Deepgram returned empty result");
  }

  // Extract utterances. Deepgram's structure is:
  // result.results.channels[0].alternatives[0].utterances
  const channel = result.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  const utterances = alternative?.utterances || [];

  log.info(
    { utteranceCount: utterances.length },
    "Deepgram batch STT completed successfully"
  );

  return {
    utterances: utterances.map(
      (u: {
        start: number;
        end: number;
        transcript: string;
        speaker: number;
        confidence: number;
        words?: BatchUtterance["words"];
      }) => ({
        start: u.start,
        end: u.end,
        text: u.transcript,
        speaker: u.speaker,
        confidence: u.confidence,
        words: u.words,
      })
    ),
  };
}
