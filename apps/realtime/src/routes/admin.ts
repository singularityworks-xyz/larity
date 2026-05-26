import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { type Elysia, t } from "elysia";
import { defaultAudioStreamerConfig } from "../audio/streamer";
import { createRealtimeLogger } from "../logger";

const log = createRealtimeLogger("admin-routes");

export function createWavHeader(
  dataLength: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

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
    "/admin/sessions/:id/audio.wav",
    async ({ params: { id }, headers, set }) => {
      const authHeader = headers.authorization;
      const apiKey = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : "";

      if (!adminKey || apiKey !== adminKey) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const sessionId = id;
      const key = `${sessionId}/raw_audio.pcm16`;

      try {
        const command = new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        });

        const response = await s3Client.send(command);
        const bodyStream = response.Body;
        if (!bodyStream) {
          set.status = 404;
          return { error: "Audio data not found" };
        }

        const chunks: Uint8Array[] = [];
        for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const pcmData = Buffer.concat(chunks);
        const contentLength = response.ContentLength ?? pcmData.length;

        const wavHeader = createWavHeader(Number(contentLength), 16_000, 1, 16);

        const wavBuffer = Buffer.concat([wavHeader, pcmData]);

        set.status = 200;
        set.headers["Content-Type"] = "audio/wav";
        set.headers["Content-Disposition"] =
          `attachment; filename="session_${sessionId}.wav"`;

        return new Response(wavBuffer, {
          headers: {
            "Content-Type": "audio/wav",
            "Content-Disposition": `attachment; filename="session_${sessionId}.wav"`,
          },
        });
      } catch (error) {
        log.error({ err: error, sessionId }, "Failed to fetch audio from S3");
        set.status = 404;
        return { error: "Session audio not found" };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  );
}
