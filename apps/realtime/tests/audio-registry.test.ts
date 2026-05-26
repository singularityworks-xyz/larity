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

describe("AudioRegistry", () => {
  beforeEach(() => {
    mockUploadDone.mockClear();
    mockS3Send.mockClear();
  });

  it("should create and retrieve streamers", async () => {
    const { createStreamer, getStreamer, getAllStreamerIds } = await import(
      "../src/audio/registry"
    );

    createStreamer("session-1", "org-1");
    const streamer = getStreamer("session-1");
    expect(streamer).toBeDefined();
    expect(streamer?.done).toBe(false);

    const ids = getAllStreamerIds();
    expect(ids).toContain("session-1");
  });

  it("should close and remove streamers", async () => {
    const { createStreamer, getStreamer, closeStreamer } = await import(
      "../src/audio/registry"
    );

    createStreamer("session-close-test", "org-1");
    expect(getStreamer("session-close-test")).toBeDefined();

    await closeStreamer("session-close-test");
    expect(getStreamer("session-close-test")).toBeUndefined();
    expect(mockUploadDone).toHaveBeenCalled();
  });

  it("should not throw when closing non-existent streamer", async () => {
    const { closeStreamer } = await import("../src/audio/registry");

    await expect(closeStreamer("non-existent")).resolves.toBeUndefined();
  });

  it("should handle close on failed streamer", async () => {
    mockUploadDone.mockRejectedValue(new Error("Upload failed"));

    const { createStreamer, closeStreamer } = await import(
      "../src/audio/registry"
    );

    createStreamer("session-fail", "org-1");

    // Should not throw — errors are caught and logged
    await expect(closeStreamer("session-fail")).resolves.toBeUndefined();
  });
});
