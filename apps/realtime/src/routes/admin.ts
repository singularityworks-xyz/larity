import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { type Elysia, t } from "elysia";
import { defaultAudioStreamerConfig } from "../audio/streamer";
import { createRealtimeLogger } from "../logger";

const log = createRealtimeLogger("admin-routes");

// WAV header constants
const WAV_HEADER_SIZE = 44;
const RIFF_OFFSET = 0;
const FILE_SIZE_OFFSET = 4;
const WAVE_OFFSET = 8;
const FMT_CHUNK_OFFSET = 12;
const FMT_CHUNK_SIZE_OFFSET = 16;
const AUDIO_FORMAT_OFFSET = 20;
const CHANNELS_OFFSET = 22;
const SAMPLE_RATE_OFFSET = 24;
const BYTE_RATE_OFFSET = 28;
const BLOCK_ALIGN_OFFSET = 32;
const BITS_PER_SAMPLE_OFFSET = 34;
const DATA_LABEL_OFFSET = 36;
const DATA_SIZE_OFFSET = 40;

export function createWavHeader(
  dataLength: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  // RIFF header
  header.write("RIFF", RIFF_OFFSET);
  header.writeUInt32LE(36 + dataLength, FILE_SIZE_OFFSET);
  header.write("WAVE", WAVE_OFFSET);

  // fmt chunk
  header.write("fmt ", FMT_CHUNK_OFFSET);
  header.writeUInt32LE(16, FMT_CHUNK_SIZE_OFFSET); // chunk size
  header.writeUInt16LE(1, AUDIO_FORMAT_OFFSET); // PCM format
  header.writeUInt16LE(channels, CHANNELS_OFFSET);
  header.writeUInt32LE(sampleRate, SAMPLE_RATE_OFFSET);
  header.writeUInt32LE(byteRate, BYTE_RATE_OFFSET);
  header.writeUInt16LE(blockAlign, BLOCK_ALIGN_OFFSET);
  header.writeUInt16LE(bitsPerSample, BITS_PER_SAMPLE_OFFSET);

  // data chunk
  header.write("data", DATA_LABEL_OFFSET);
  header.writeUInt32LE(dataLength, DATA_SIZE_OFFSET);

  return header;
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

function isS3NotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const error = err as Record<string, unknown>;
  return error.name === "NoSuchKey" || error.code === "NoSuchKey";
}

async function fetchS3File(
  s3Client: S3Client,
  bucket: string,
  key: string
): Promise<Buffer | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await s3Client.send(command);
    const bodyStream = response.Body;
    if (!bodyStream) {
      return null;
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function interleaveStereo(ch0: Buffer, ch1: Buffer): Buffer {
  const ch0Samples = ch0.length / 2;
  const ch1Samples = ch1.length / 2;
  const totalSamples = Math.max(ch0Samples, ch1Samples);
  const stereoBuffer = Buffer.alloc(totalSamples * 4);

  for (let i = 0; i < totalSamples; i++) {
    const val0 = i < ch0Samples ? ch0.readInt16LE(i * 2) : 0;
    const val1 = i < ch1Samples ? ch1.readInt16LE(i * 2) : 0;
    stereoBuffer.writeInt16LE(val0, i * 4);
    stereoBuffer.writeInt16LE(val1, i * 4 + 2);
  }

  return stereoBuffer;
}

async function getPcmDataForSession(
  s3Client: S3Client,
  bucket: string,
  orgId: string,
  sessionId: string,
  channel: string
): Promise<{ pcmData: Buffer | null; channelsCount: number }> {
  if (channel === "stereo") {
    const [ch0, ch1] = await Promise.all([
      fetchS3File(s3Client, bucket, `${orgId}/${sessionId}/ch0.pcm16`),
      fetchS3File(s3Client, bucket, `${orgId}/${sessionId}/ch1.pcm16`),
    ]);

    if (!(ch0 || ch1)) {
      return { pcmData: null, channelsCount: 2 };
    }

    const pcmData = interleaveStereo(
      ch0 ?? Buffer.alloc(0),
      ch1 ?? Buffer.alloc(0)
    );
    return { pcmData, channelsCount: 2 };
  }

  const fileKey = channel === "1" ? "ch1.pcm16" : "ch0.pcm16";
  const pcmData = await fetchS3File(
    s3Client,
    bucket,
    `${orgId}/${sessionId}/${fileKey}`
  );
  return { pcmData, channelsCount: 1 };
}

async function handleStereoDownload(
  s3Client: S3Client,
  bucket: string,
  orgId: string,
  sessionId: string,
  set: Record<string, unknown>
): Promise<Response | { error: string }> {
  const { pcmData, channelsCount } = await getPcmDataForSession(
    s3Client,
    bucket,
    orgId,
    sessionId,
    "stereo"
  );

  if (!pcmData) {
    set.status = 404;
    return { error: "Session audio not found" };
  }

  const wavHeader = createWavHeader(pcmData.length, 16_000, channelsCount, 16);
  const wavBuffer = Buffer.concat([wavHeader, pcmData]);

  set.status = 200;
  // biome-ignore lint/suspicious/noExplicitAny: Elysia headers type
  (set as any).headers["Content-Type"] = "audio/wav";
  // biome-ignore lint/suspicious/noExplicitAny: Elysia headers type
  (set as any).headers["Content-Disposition"] =
    `attachment; filename="session_${sessionId}.wav"`;

  return new Response(wavBuffer, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `attachment; filename="session_${sessionId}.wav"`,
    },
  });
}

async function handleMonoStreaming(
  s3Client: S3Client,
  bucket: string,
  orgId: string,
  sessionId: string,
  channel: string,
  set: Record<string, unknown>
): Promise<Response | { error: string }> {
  const fileKey = channel === "1" ? "ch1.pcm16" : "ch0.pcm16";
  const key = `${orgId}/${sessionId}/${fileKey}`;

  let response: import("@aws-sdk/client-s3").GetObjectCommandOutput;
  try {
    response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error) {
    if (isS3NotFoundError(error)) {
      set.status = 404;
      return { error: "Session audio not found" };
    }
    throw error;
  }

  const bodyStream = response.Body;
  if (!bodyStream) {
    set.status = 404;
    return { error: "Session audio not found" };
  }

  const dataLength = Number(response.ContentLength ?? 0);
  const wavHeader = createWavHeader(dataLength, 16_000, 1, 16);

  set.status = 200;
  // biome-ignore lint/suspicious/noExplicitAny: Elysia headers type
  (set as any).headers["Content-Type"] = "audio/wav";
  // biome-ignore lint/suspicious/noExplicitAny: Elysia headers type
  (set as any).headers["Content-Disposition"] =
    `attachment; filename="session_${sessionId}.wav"`;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(wavHeader);
      for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `attachment; filename="session_${sessionId}.wav"`,
    },
  });
}

export function addAdminRoutes(app: Elysia): void {
  const config = defaultAudioStreamerConfig();

  const adminKey = ADMIN_API_KEY;
  if (!adminKey) {
    log.warn(
      "ADMIN_API_KEY not set — admin routes will reject all requests. Set ADMIN_API_KEY env var to enable."
    );
  }

  const s3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });

  app.get(
    "/admin/sessions/:orgId/:id/audio.wav",
    async ({ params: { orgId, id }, query, headers, set }) => {
      const authHeader = headers.authorization;
      const apiKey = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : "";

      if (!adminKey || apiKey !== adminKey) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const sessionId = id;
      const channel = query?.channel ?? "0";

      try {
        if (channel === "stereo") {
          return await handleStereoDownload(
            s3Client,
            config.bucket,
            orgId,
            sessionId,
            set
          );
        }

        return await handleMonoStreaming(
          s3Client,
          config.bucket,
          orgId,
          sessionId,
          channel,
          set
        );
      } catch (error) {
        if (isS3NotFoundError(error)) {
          set.status = 404;
          return { error: "Session audio not found" };
        }
        log.error({ err: error, sessionId }, "Failed to fetch audio from S3");
        set.status = 502;
        return { error: "Failed to fetch session audio" };
      }
    },
    {
      params: t.Object({
        orgId: t.String(),
        id: t.String(),
      }),
      query: t.Optional(
        t.Object({
          channel: t.Optional(
            t.Union([t.Literal("0"), t.Literal("1"), t.Literal("stereo")])
          ),
        })
      ),
    }
  );
}
