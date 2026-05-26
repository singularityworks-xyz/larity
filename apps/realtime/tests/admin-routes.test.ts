import { describe, expect, it, mock } from "bun:test";

const mockS3Send = mock(() => Promise.resolve({}));
const mockS3Destroy = mock();

// The admin.ts module imports S3Client, GetObjectCommand, and PutObjectCommand
// We must mock all of them so Bun doesn't try to resolve the real module
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
    destroy = mockS3Destroy;
  },
  GetObjectCommand: class MockGetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutObjectCommand: class MockPutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

describe("Admin Routes - WAV Header", () => {
  it("should produce a valid 44-byte WAV header", async () => {
    const { createWavHeader } = await import("../src/routes/admin");

    // 1 second of 16-bit mono PCM at 16kHz = 32000 bytes
    const header = createWavHeader(32_000, 16_000, 1, 16);

    expect(header.length).toBe(44);

    // RIFF marker
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    // File size = 36 + data size = 36 + 32000 = 32036
    expect(header.readUInt32LE(4)).toBe(36 + 32_000);
    // WAVE format
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
    // fmt chunk marker
    expect(header.toString("ascii", 12, 16)).toBe("fmt ");
    // PCM format = 1
    expect(header.readUInt16LE(20)).toBe(1);
    // Mono = 1 channel
    expect(header.readUInt16LE(22)).toBe(1);
    // Sample rate = 16000
    expect(header.readUInt32LE(24)).toBe(16_000);
    // Byte rate = 16000 * 1 * 2 = 32000
    expect(header.readUInt32LE(28)).toBe(32_000);
    // Block align = 1 * 2 = 2
    expect(header.readUInt16LE(32)).toBe(2);
    // Bits per sample = 16
    expect(header.readUInt16LE(34)).toBe(16);
    // data chunk marker
    expect(header.toString("ascii", 36, 40)).toBe("data");
    // Data size
    expect(header.readUInt32LE(40)).toBe(32_000);
  });

  it("should handle stereo 48kHz WAV header", async () => {
    const { createWavHeader } = await import("../src/routes/admin");

    const header = createWavHeader(96_000, 48_000, 2, 16);

    expect(header.length).toBe(44);
    expect(header.readUInt16LE(22)).toBe(2); // stereo
    expect(header.readUInt32LE(24)).toBe(48_000);
    expect(header.readUInt32LE(28)).toBe(192_000); // 48000 * 2 * 2
    expect(header.readUInt16LE(32)).toBe(4); // 2 * 2
  });

  it("should handle zero-length data", async () => {
    const { createWavHeader } = await import("../src/routes/admin");

    const header = createWavHeader(0, 16_000, 1, 16);

    expect(header.length).toBe(44);
    expect(header.readUInt32LE(40)).toBe(0);
    expect(header.readUInt32LE(4)).toBe(36); // 36 + 0
  });
});
