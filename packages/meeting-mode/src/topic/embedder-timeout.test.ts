import { describe, expect, mock, test } from "bun:test";

mock.restore();
const { GoogleGenAIEmbedder } = await import("./embedder");

const TIMEOUT_MESSAGE = /timed out/;

describe("GoogleGenAIEmbedder timeout", () => {
  test("a hung request fails fast instead of hanging", async () => {
    const embedder = new GoogleGenAIEmbedder();
    const start = Date.now();
    await expect(embedder.embed("hello world today", 1)).rejects.toThrow(
      TIMEOUT_MESSAGE
    );
    // Must settle on the timeout budget, not on network failure timing.
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
