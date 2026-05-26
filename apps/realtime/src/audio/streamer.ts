import { PassThrough } from "node:stream";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createS3Client, getS3Config } from "@larity/infra/s3";
import { createRealtimeLogger } from "../logger";

const log = createRealtimeLogger("audio-streamer");

export type AudioStreamerConfig = import("@larity/infra/s3").S3Config;

export function defaultAudioStreamerConfig(): AudioStreamerConfig {
  return getS3Config();
}

export interface ChannelInfo {
  file: string;
  source: "mic" | "system";
  bytes: number;
  durationMs: number;
}

export interface AudioManifest {
  sessionId: string;
  orgId: string;
  codec: "pcm16";
  sampleRate: 16000;
  totalDurationMs: number;
  channels: {
    ch0: ChannelInfo;
    ch1: ChannelInfo;
  };
}

export class AudioStreamer {
  private readonly ch0Stream: PassThrough;
  private readonly ch1Stream: PassThrough;
  private readonly ch0Upload: Upload;
  private readonly ch1Upload: Upload;
  private readonly config: AudioStreamerConfig;
  private readonly orgId: string;
  private readonly sessionId: string;
  private ch0Bytes: number;
  private ch1Bytes: number;
  private ch0StartedAt: number | null;
  private ch1StartedAt: number | null;
  private readonly startedAt: number;
  private _done: boolean;
  private readonly s3Client: S3Client;

  constructor(orgId: string, sessionId: string, config?: AudioStreamerConfig) {
    this.orgId = orgId;
    this.sessionId = sessionId;
    this.config = config ?? defaultAudioStreamerConfig();
    this.ch0Bytes = 0;
    this.ch1Bytes = 0;
    this.ch0StartedAt = null;
    this.ch1StartedAt = null;
    this.startedAt = Date.now();
    this._done = false;

    this.ch0Stream = new PassThrough({
      autoDestroy: false,
      highWaterMark: 10 * 1024 * 1024,
    });
    this.ch1Stream = new PassThrough({
      autoDestroy: false,
      highWaterMark: 10 * 1024 * 1024,
    });

    this.s3Client = createS3Client(this.config);

    const ch0Key = `${orgId}/${sessionId}/ch0.pcm16`;
    const ch1Key = `${orgId}/${sessionId}/ch1.pcm16`;

    this.ch0Upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.config.bucket,
        Key: ch0Key,
        Body: this.ch0Stream,
        ServerSideEncryption: "AES256",
      },
      queueSize: 4,
      leavePartsOnError: false,
    });

    this.ch1Upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.config.bucket,
        Key: ch1Key,
        Body: this.ch1Stream,
        ServerSideEncryption: "AES256",
      },
      queueSize: 4,
      leavePartsOnError: false,
    });

    this.ch0Upload.on("httpUploadProgress", (progress) => {
      if (progress.loaded) {
        log.debug(
          {
            sessionId,
            channel: "ch0",
            loaded: progress.loaded,
            total: progress.total,
          },
          "S3 upload progress"
        );
      }
    });

    this.ch1Upload.on("httpUploadProgress", (progress) => {
      if (progress.loaded) {
        log.debug(
          {
            sessionId,
            channel: "ch1",
            loaded: progress.loaded,
            total: progress.total,
          },
          "S3 upload progress"
        );
      }
    });

    log.info(
      { orgId, sessionId, bucket: this.config.bucket },
      "AudioStreamer created with dual channels"
    );
  }

  get done(): boolean {
    return this._done;
  }

  writeDemux(tag: number, pcm: Buffer | Uint8Array): void {
    if (this._done) {
      log.warn(
        { sessionId: this.sessionId },
        "Attempted to write to closed AudioStreamer"
      );
      return;
    }

    const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    const now = Date.now();

    if (tag === 0) {
      if (this.ch0StartedAt === null) {
        this.ch0StartedAt = now;
      }
      this.ch0Bytes += buf.byteLength;
      const ok = this.ch0Stream.write(buf);
      if (!ok) {
        log.debug({ sessionId: this.sessionId }, "ch0 stream backpressure");
      }
    } else if (tag === 1) {
      if (this.ch1StartedAt === null) {
        this.ch1StartedAt = now;
      }
      this.ch1Bytes += buf.byteLength;
      const ok = this.ch1Stream.write(buf);
      if (!ok) {
        log.debug({ sessionId: this.sessionId }, "ch1 stream backpressure");
      }
    } else {
      log.warn(
        { sessionId: this.sessionId, tag },
        "Unknown channel tag in writeDemux"
      );
    }
  }

  async end(): Promise<AudioManifest> {
    if (this._done) {
      throw new Error("AudioStreamer already closed");
    }

    this._done = true;
    this.ch0Stream.end();
    this.ch1Stream.end();

    log.info(
      {
        sessionId: this.sessionId,
        ch0Bytes: this.ch0Bytes,
        ch1Bytes: this.ch1Bytes,
      },
      "Ending dual channel audio streams, waiting for S3 uploads to complete"
    );

    await Promise.all([this.ch0Upload.done(), this.ch1Upload.done()]);
    log.info({ sessionId: this.sessionId }, "S3 dual channel uploads complete");

    const now = Date.now();
    const totalDurationMs = now - this.startedAt;
    const ch0DurationMs = this.ch0StartedAt ? now - this.ch0StartedAt : 0;
    const ch1DurationMs = this.ch1StartedAt ? now - this.ch1StartedAt : 0;

    const manifest: AudioManifest = {
      sessionId: this.sessionId,
      orgId: this.orgId,
      codec: "pcm16",
      sampleRate: 16_000,
      totalDurationMs,
      channels: {
        ch0: {
          file: "ch0.pcm16",
          source: "mic",
          bytes: this.ch0Bytes,
          durationMs: ch0DurationMs,
        },
        ch1: {
          file: "ch1.pcm16",
          source: "system",
          bytes: this.ch1Bytes,
          durationMs: ch1DurationMs,
        },
      },
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
