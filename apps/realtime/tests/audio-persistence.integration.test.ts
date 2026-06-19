/**
 * Audio Persistence Integration Tests
 *
 * Tests the full audio persistence pipeline:
 * - AudioStreamer writes PCM frames via S3 multipart upload
 * - Manifest generation on session close
 * - Admin WAV recovery endpoint header generation
 *
 * Uses mocked S3 — no real Cloudflare R2 credentials needed.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Track S3 calls for assertion
const s3Calls: Array<{ command: string; input: unknown }> = [];

const uploadResolvers: Array<(value: unknown) => void> = [];
const mockUploadDone = mock(
  () =>
    new Promise((resolve) => {
      uploadResolvers.push(resolve);
    })
);
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
}));

mock.module("@aws-sdk/lib-storage", () => ({
  Upload: class MockUpload {
    done = mockUploadDone;
    on = mockUploadOn;
  },
}));

describe("Audio Persistence Integration", () => {
  beforeEach(() => {
    s3Calls.length = 0;
    (globalThis as any).s3SendMock = mockS3Send;
    (globalThis as any).s3Calls = s3Calls;
    mockUploadDone.mockClear();
    mockS3Send.mockClear();
    uploadResolvers.length = 0;
  });

  afterEach(() => {
    (globalThis as any).s3SendMock = undefined;
    (globalThis as any).s3Calls = undefined;
  });

  it("should persist PCM frames and generate manifest on close", async () => {
    const { AudioStreamer } = await import("../src/audio/streamer");

    const streamer = new AudioStreamer("org-42", "session-99", {
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "mock-access-key",
      secretAccessKey: "mock-secret-key",
      bucket: "larity-audio",
    });

    // Simulate 100ms of PCM16 audio (1600 bytes at 16kHz, 16-bit mono)
    const pcmFrame = Buffer.alloc(1600);
    for (const i of pcmFrame.keys()) {
      // biome-ignore lint/suspicious/noBitwiseOperators: test pattern fill
      pcmFrame[i] = i & 0xff;
    }

    for (const _ of Array.from({ length: 5 })) {
      streamer.writeDemux(0, pcmFrame);
      streamer.writeDemux(1, pcmFrame);
    }

    // Start end() — it will await the upload
    const endPromise = streamer.end();

    // Resolve the uploads from the mock
    for (const resolve of uploadResolvers) {
      resolve({});
    }

    // Now await the end
    const manifest = await endPromise;

    expect(manifest.sessionId).toBe("session-99");
    expect(manifest.orgId).toBe("org-42");
    expect(manifest.codec).toBe("pcm16");
    expect(manifest.sampleRate).toBe(16_000);
    expect(manifest.channels.ch0.file).toBe("ch0.pcm16");
    expect(manifest.channels.ch0.bytes).toBe(1600 * 5);
    expect(manifest.channels.ch1.file).toBe("ch1.pcm16");
    expect(manifest.channels.ch1.bytes).toBe(1600 * 5);
    expect(manifest.totalDurationMs).toBeGreaterThan(0);
    expect(mockUploadDone).toHaveBeenCalledTimes(4);

    const manifestCalls = s3Calls.filter(
      (c) =>
        c.command === "PutObjectCommand" &&
        typeof c.input === "object" &&
        c.input !== null &&
        "Key" in c.input &&
        (c.input as Record<string, string>).Key?.includes("manifest.json")
    );
    expect(manifestCalls.length).toBe(1);

    const manifestInput = manifestCalls[0]?.input as Record<string, string>;
    expect(manifestInput.Bucket).toBe("larity-audio");
    expect(manifestInput.Key).toBe("org-42/session-99/manifest.json");
  });

  it("should reconstruct a valid WAV from PCM data", async () => {
    const { createWavHeader } = await import("../src/routes/admin");

    const pcmDataLength = 16_000 * 2;
    const header = createWavHeader(pcmDataLength, 16_000, 1, 16);

    const wavBuffer = Buffer.concat([
      header,
      Buffer.alloc(pcmDataLength, 0x00),
    ]);

    expect(wavBuffer.length).toBe(44 + pcmDataLength);
    expect(wavBuffer.readUInt32LE(4)).toBe(36 + pcmDataLength);
    expect(wavBuffer.readUInt32LE(40)).toBe(pcmDataLength);
    expect(wavBuffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wavBuffer.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wavBuffer.toString("ascii", 36, 40)).toBe("data");
  });

  it("should handle streamer lifecycle: write → end → manifest", async () => {
    const { createStreamer, getStreamer, closeStreamer } = await import(
      "../src/audio/registry"
    );

    createStreamer("integration-session", "org-1");
    expect(getStreamer("integration-session")).toBeDefined();

    const streamer = getStreamer("integration-session");
    if (streamer) {
      streamer.writeDemux(0, Buffer.alloc(640));
    }

    const closePromise = closeStreamer("integration-session");
    for (const resolve of uploadResolvers) {
      resolve({});
    }
    await closePromise;

    expect(getStreamer("integration-session")).toBeUndefined();
  });
});
