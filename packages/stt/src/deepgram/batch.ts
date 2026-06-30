import type { ListenV1Response } from "@deepgram/sdk";
import { createSttLogger } from "../logger";
import { getDeepgramClient } from "./client";

const log = createSttLogger("dg-batch");

export interface BatchUtterance {
  confidence: number;
  end: number;
  speaker: number;
  start: number;
  text: string;
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

  let response: ListenV1Response | null = null;
  try {
    response = (await deepgram.listen.v1.media.transcribeFile(
      { data: buffer, contentType: mimeType },
      {
        model: "nova-3",
        diarize: true,
        smart_format: true,
        utterances: true,
        encoding: "linear16",
      },
      {
        queryParams: {
          sample_rate: 16_000,
        },
      }
    )) as ListenV1Response;
  } catch (err) {
    log.error({ err }, "Deepgram batch STT failed");
    throw err;
  }

  if (!response) {
    throw new Error("Deepgram returned empty response");
  }

  const results = response.results;
  if (!results) {
    throw new Error("Deepgram returned empty results");
  }

  const utterances = results.utterances || [];

  log.info(
    { utteranceCount: utterances.length },
    "Deepgram batch STT completed successfully"
  );

  return {
    utterances: utterances.map((u) => ({
      start: u.start ?? 0,
      end: u.end ?? 0,
      text: u.transcript ?? "",
      speaker: u.speaker ?? -1,
      confidence: u.confidence ?? 0,
      words: u.words?.map((w) => ({
        word: w.word ?? "",
        start: w.start ?? 0,
        end: w.end ?? 0,
        confidence: w.confidence ?? 0,
        speaker: w.speaker,
      })),
    })),
  };
}
