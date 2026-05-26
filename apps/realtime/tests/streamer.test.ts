import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockUploadDone = mock(() => Promise.resolve({}));
const mockUploadOn = mock();
const mockS3Send = mock(() => Promise.resolve({}));
const mockS3Destroy = mock();

mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
    destroy = mockS3Destroy;
  },
  PutObjectCommand: class MockPutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

mock.module("@aws-sdk/lib-storage", () => ({
  Upload: class MockUpload {
    done = mockUploadDone;
    on = mockUploadOn;
  },
}));

describe("AudioStreamer", () => {
  beforeEach(() => {
    mockUploadDone.mockClear();
    mockUploadOn.mockClear();
    mockS3Send.mockClear();
    mockS3Destroy.mockClear();
  });

  it("should create a streamer and accept writes", async () => {
    const { AudioStreamer } = await import("../src/audio/streamer");

    const streamer = new AudioStreamer("org-1", "session-1", {
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "test",
      secretAccessKey: "test",
      bucket: "larity-audio",
    });

    expect(streamer.done).toBe(false);

    // Write some PCM frames
    const frame1 = Buffer.alloc(320, 0x00); // 10ms of 16kHz 16-bit mono silence
    const frame2 = Buffer.alloc(320, 0xff);
    streamer.write(frame1);
    streamer.write(frame2);

    expect(streamer.done).toBe(false);
  });

  it("should end the stream and produce a manifest", async () => {
    const { AudioStreamer } = await import("../src/audio/streamer");

    const streamer = new AudioStreamer("org-1", "session-2", {
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "test",
      secretAccessKey: "test",
      bucket: "larity-audio",
    });

    streamer.write(Buffer.alloc(320));

    const manifest = await streamer.end();

    expect(streamer.done).toBe(true);
    expect(manifest.orgId).toBe("org-1");
    expect(manifest.sessionId).toBe("session-2");
    expect(manifest.codec).toBe("pcm16");
    expect(manifest.sampleRate).toBe(16_000);
    expect(manifest.audioFile).toBe("raw_audio.pcm16");
    expect(manifest.totalDurationMs).toBeGreaterThanOrEqual(0);

    // Should have completed the upload
    expect(mockUploadDone).toHaveBeenCalled();

    // Should have written the manifest JSON
    expect(mockS3Send).toHaveBeenCalled();
  });

  it("should reject writes after end", async () => {
    const { AudioStreamer } = await import("../src/audio/streamer");

    const streamer = new AudioStreamer("org-1", "session-3", {
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "test",
      secretAccessKey: "test",
      bucket: "larity-audio",
    });

    await streamer.end();

    // Write after end should not throw but should be ignored
    expect(() => streamer.write(Buffer.alloc(320))).not.toThrow();
    expect(streamer.done).toBe(true);
  });
});
