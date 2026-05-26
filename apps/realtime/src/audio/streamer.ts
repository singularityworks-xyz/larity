import { PassThrough } from "node:stream";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createRealtimeLogger } from "../logger";

const log = createRealtimeLogger("audio-streamer");

export interface AudioStreamerConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function defaultAudioStreamerConfig(): AudioStreamerConfig {
  return {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.S3_AUDIO_BUCKET ?? "larity-audio",
  };
}

export interface AudioManifest {
  sessionId: string;
  orgId: string;
  codec: "pcm16";
  sampleRate: 16000;
  totalDurationMs: number;
  audioFile: "raw_audio.pcm16";
}

export class AudioStreamer {
  private readonly stream: PassThrough;
  private readonly upload: Upload;
  private readonly config: AudioStreamerConfig;
  private readonly orgId: string;
  private readonly sessionId: string;
  private totalBytes: number;
  private readonly startedAt: number;
  private _done: boolean;
  private readonly s3Client: S3Client;

  constructor(orgId: string, sessionId: string, config?: AudioStreamerConfig) {
    this.orgId = orgId;
    this.sessionId = sessionId;
    this.config = config ?? defaultAudioStreamerConfig();
    this.totalBytes = 0;
    this.startedAt = Date.now();
    this._done = false;
    this.uploadPromise = null;

    this.stream = new PassThrough({
      autoDestroy: false,
    });

    this.s3Client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const key = `${orgId}/${sessionId}/raw_audio.pcm16`;

    this.upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: this.stream,
        ServerSideEncryption: "AES256",
      },
      queueSize: 4,
      leavePartsOnError: false,
    });

    this.upload.on("httpUploadProgress", (progress) => {
      if (progress.loaded) {
        log.debug(
          { sessionId, loaded: progress.loaded, total: progress.total },
          "S3 upload progress"
        );
      }
    });

    log.info(
      { orgId, sessionId, bucket: this.config.bucket },
      "AudioStreamer created"
    );
  }

  get done(): boolean {
    return this._done;
  }

  write(frame: Buffer | Uint8Array): void {
    if (this._done) {
      log.warn(
        { sessionId: this.sessionId },
        "Attempted to write to closed AudioStreamer"
      );
      return;
    }

    const buf = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
    this.totalBytes += buf.byteLength;
    const ok = this.stream.write(buf);
    if (!ok) {
      log.warn(
        { sessionId: this.sessionId },
        "Stream backpressure: upload falling behind"
      );
    }
  }

  async end(): Promise<AudioManifest> {
    if (this._done) {
      throw new Error("AudioStreamer already closed");
    }

    this._done = true;
    this.stream.end();

    log.info(
      { sessionId: this.sessionId, totalBytes: this.totalBytes },
      "Ending audio stream, waiting for S3 upload to complete"
    );

    await this.upload.done();
    log.info({ sessionId: this.sessionId }, "S3 upload complete");

    const now = Date.now();
    const totalDurationMs = now - this.startedAt;

    const manifest: AudioManifest = {
      sessionId: this.sessionId,
      orgId: this.orgId,
      codec: "pcm16",
      sampleRate: 16_000,
      totalDurationMs,
      audioFile: "raw_audio.pcm16",
    };

    const manifestKey = `${this.orgId}/${this.sessionId}/manifest.json`;
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: manifestKey,
          Body: JSON.stringify(manifest, null, 2),
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
        })
      );
      log.info(
        { sessionId: this.sessionId, manifestKey },
        "Manifest written to S3"
      );
    } catch (error) {
      log.error(
        { err: error, sessionId: this.sessionId },
        "Failed to write manifest to S3"
      );
    }

    this.s3Client.destroy();

    return manifest;
  }
}
