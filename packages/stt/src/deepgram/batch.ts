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
interface DeepgramResponse {
  result?: {
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          utterances?: Array<{
            start: number;
            end: number;
            transcript: string;
            speaker: number;
            confidence: number;
            words?: BatchUtterance["words"];
          }>;
        }>;
      }>;
    };
  };
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType = "audio/x-pcm"
): Promise<BatchTranscriptionResult> {
  const allowedMimeTypes = ["audio/pcm", "audio/x-pcm", "audio/L16"];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error(
      `Unsupported mimeType: ${mimeType}. Only PCM types are allowed.`
    );
  }

  const deepgram = getDeepgramClient();

  log.info(
    { bufferSize: buffer.length, mimeType },
    "Sending batch STT request to Deepgram"
  );

  let response: DeepgramResponse | null = null;
  try {
    response = (await deepgram.listen.prerecorded.transcribeFile(buffer, {
      model: "nova-3",
      diarize: true,
      diarize_model: "latest",
      smart_format: true,
      utterances: true,
      encoding: "linear16",
      sample_rate: 16_000,
    })) as DeepgramResponse;
  } catch (err) {
    log.error({ err }, "Deepgram batch STT failed");
    throw err;
  }

  if (!response) {
    throw new Error("Deepgram returned empty response");
  }

  const result = response.result;
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
