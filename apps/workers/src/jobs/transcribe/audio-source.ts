import {
  createS3Client,
  GetObjectCommand,
  getS3Config,
  type S3Client,
} from "@larity/infra/s3";
import {
  type BatchTranscriptionResult,
  transcribeAudioBuffer,
} from "@larity/stt";
import type { createWorkerLogger } from "../../logger";

type WorkerLogger = ReturnType<typeof createWorkerLogger>;

interface S3Error {
  $metadata?: {
    httpStatusCode?: number;
  };
  name: string;
}

/**
 * Downloads a file from S3 and returns its contents as a Buffer.
 * Returns null if the file does not exist.
 */
async function downloadS3File(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<Buffer | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) {
      return null;
    }
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error: unknown) {
    const s3Err = error as S3Error;
    if (s3Err.name === "NoSuchKey" || s3Err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetches the raw audio files from S3 and transcribes them using Deepgram.
 */
export async function fetchAndTranscribeAudio(
  s3Prefix: string,
  log: WorkerLogger
): Promise<{
  ch0Result: BatchTranscriptionResult | null;
  ch1Result: BatchTranscriptionResult | null;
}> {
  const s3 = createS3Client();
  try {
    const s3Config = getS3Config();

    log.info({ s3Prefix }, "Fetching audio channels from S3");
    const ch0Buffer = await downloadS3File(
      s3,
      s3Config.bucket,
      `${s3Prefix}/ch0.pcm16`
    );
    const ch1Buffer = await downloadS3File(
      s3,
      s3Config.bucket,
      `${s3Prefix}/ch1.pcm16`
    );

    if (!(ch0Buffer || ch1Buffer)) {
      throw new Error(
        `No audio files found in S3 bucket for prefix: ${s3Prefix}`
      );
    }

    const batchPromises: Promise<BatchTranscriptionResult | null>[] = [];

    if (ch0Buffer) {
      log.info("Submitting ch0 (mic) to Deepgram batch STT");
      batchPromises.push(
        transcribeAudioBuffer(ch0Buffer).catch((err) => {
          log.error({ err }, "ch0 (mic) batch STT failed");
          return null;
        })
      );
    } else {
      log.warn("ch0 (mic) audio is missing, skipping");
      batchPromises.push(Promise.resolve(null));
    }

    if (ch1Buffer) {
      log.info("Submitting ch1 (system) to Deepgram batch STT");
      batchPromises.push(
        transcribeAudioBuffer(ch1Buffer).catch((err) => {
          log.error({ err }, "ch1 (system) batch STT failed");
          return null;
        })
      );
    } else {
      log.warn("ch1 (system) audio is missing, skipping");
      batchPromises.push(Promise.resolve(null));
    }

    const [ch0Result, ch1Result] = await Promise.all(batchPromises);

    if (!(ch0Result || ch1Result)) {
      throw new Error(
        "Both batch transcription jobs failed or returned empty results"
      );
    }

    return { ch0Result: ch0Result ?? null, ch1Result: ch1Result ?? null };
  } finally {
    s3.destroy();
  }
}
