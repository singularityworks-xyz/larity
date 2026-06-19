import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockUploadDone = mock(() => Promise.resolve({}));
const mockUploadOn = mock();
const mockS3Send = mock(() => Promise.resolve({}));
const mockS3Destroy = mock();

mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send(cmd: any) {
      if ((globalThis as any).s3SendMock) {
        return (globalThis as any).s3SendMock(cmd);
      }
      return Promise.resolve({});
    }
    destroy = mockS3Destroy;
  },
  PutObjectCommand: class MockPutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      if ((globalThis as any).s3Calls) {
        (globalThis as any).s3Calls.push({
          command: "PutObjectCommand",
          input,
        });
      }
    }
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      if ((globalThis as any).s3Calls) {
        (globalThis as any).s3Calls.push({
          command: "DeleteObjectCommand",
          input,
        });
      }
    }
  },
  GetObjectCommand: class MockGetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      if ((globalThis as any).s3Calls) {
        (globalThis as any).s3Calls.push({
          command: "GetObjectCommand",
          input,
        });
      }
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
    (globalThis as any).s3SendMock = mockS3Send;
    mockUploadDone.mockClear();
    mockUploadOn.mockClear();
    mockS3Send.mockClear();
    mockS3Destroy.mockClear();
  });

  afterEach(() => {
    (globalThis as any).s3SendMock = undefined;
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
    streamer.writeDemux(0, frame1);
    streamer.writeDemux(1, frame2);

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

    streamer.writeDemux(0, Buffer.alloc(320));
    streamer.writeDemux(1, Buffer.alloc(160));

    const manifest = await streamer.end();

    expect(streamer.done).toBe(true);
    expect(manifest.orgId).toBe("org-1");
    expect(manifest.sessionId).toBe("session-2");
    expect(manifest.codec).toBe("pcm16");
    expect(manifest.sampleRate).toBe(16_000);
    expect(manifest.channels.ch0.file).toBe("ch0.pcm16");
    expect(manifest.channels.ch0.source).toBe("mic");
    expect(manifest.channels.ch0.bytes).toBe(320);
    expect(manifest.channels.ch1.file).toBe("ch1.pcm16");
    expect(manifest.channels.ch1.source).toBe("system");
    expect(manifest.channels.ch1.bytes).toBe(160);
    expect(manifest.totalDurationMs).toBeGreaterThanOrEqual(0);

    // Should have completed the upload for both channels (4 times: 2 during init for catch, 2 during end)
    expect(mockUploadDone).toHaveBeenCalledTimes(4);

    // Should have written the manifest JSON
    expect(mockS3Send).toHaveBeenCalled();
  });

  it("should ignore writes after end", async () => {
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
    expect(() => streamer.writeDemux(0, Buffer.alloc(320))).not.toThrow();
    expect(streamer.done).toBe(true);
  });
});
