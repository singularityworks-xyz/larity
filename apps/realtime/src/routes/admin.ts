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
  } catch {
    return null;
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
        const { pcmData, channelsCount } = await getPcmDataForSession(
          s3Client,
          config.bucket,
          orgId,
          sessionId,
          channel
        );

        if (!pcmData) {
          set.status = 404;
          return { error: "Session audio not found" };
        }

        const wavHeader = createWavHeader(
          pcmData.length,
          16_000,
          channelsCount,
          16
        );
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
        set.status = 500;
        return { error: "Internal server error" };
      }
    },
    {
      params: t.Object({
        orgId: t.String(),
        id: t.String(),
      }),
      query: t.Optional(
        t.Object({
          channel: t.Optional(t.String()),
        })
      ),
    }
  );
}
