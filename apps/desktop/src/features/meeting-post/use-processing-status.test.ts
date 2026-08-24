import { describe, expect, it } from "bun:test";
import type { ProcessingStatus } from "./types";
import {
  isProcessingComplete,
  isProcessingInProgress,
  isProcessingSettled,
} from "./use-processing-status";

describe("useProcessingStatus state helpers", () => {
  it("returns false for undefined status across all helpers", () => {
    expect(isProcessingSettled(undefined)).toBe(false);
    expect(isProcessingComplete(undefined)).toBe(false);
    expect(isProcessingInProgress(undefined)).toBe(false);
  });

  it("detects in-progress status when steps are queued or processing", () => {
    const queuedStatus: ProcessingStatus = {
      sessionId: "m-123",
      steps: {
        transcribe: "queued",
        summary: "queued",
      },
    };
    expect(isProcessingInProgress(queuedStatus)).toBe(true);
    expect(isProcessingSettled(queuedStatus)).toBe(false);
    expect(isProcessingComplete(queuedStatus)).toBe(false);

    const activeTranscribe: ProcessingStatus = {
      sessionId: "m-123",
      steps: {
        transcribe: "processing",
        summary: "queued",
      },
    };
    expect(isProcessingInProgress(activeTranscribe)).toBe(true);
    expect(isProcessingSettled(activeTranscribe)).toBe(false);
  });

  it("detects settled status when both steps are done, failed, or null", () => {
    const bothDone: ProcessingStatus = {
      sessionId: "m-123",
      steps: {
        transcribe: "done",
        summary: "done",
      },
    };
    expect(isProcessingSettled(bothDone)).toBe(true);
    expect(isProcessingComplete(bothDone)).toBe(true);
    expect(isProcessingInProgress(bothDone)).toBe(false);

    const failedTranscribe: ProcessingStatus = {
      sessionId: "m-123",
      steps: {
        transcribe: "failed",
        summary: null,
      },
    };
    expect(isProcessingSettled(failedTranscribe)).toBe(true);
    expect(isProcessingComplete(failedTranscribe)).toBe(false);
    expect(isProcessingInProgress(failedTranscribe)).toBe(false);
  });
});
