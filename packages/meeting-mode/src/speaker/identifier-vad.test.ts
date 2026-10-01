import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const hsetMock = mock(() => Promise.resolve(1));
const expireMock = mock(() => Promise.resolve(1));

mock.module("@larity/db/redis", () => ({
  redis: { expire: expireMock, hset: hsetMock },
}));

afterAll(() => mock.restore());

// Import after the redis mock is registered so processVadSignal persists
// through the fakes and the writes are countable.
import { SpeakerIdentifier } from "./identifier";
import type { VadSignal } from "./types";

function makeSignal(type: VadSignal["type"]): VadSignal {
  const now = Date.now();
  return {
    clientSendTs: now - 100,
    role: "participant",
    serverReceiveTs: now,
    sessionId: "test-session",
    type,
    userId: "u1",
  };
}

/** Flush fire-and-forget Redis persists (`persistClockOffset` is not awaited). */
async function flushPersists(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Mirrors the subscriber's VAD path: SpeakerManager.handleVadSignal (which
 * calls processVadSignal) followed by tryLateIdentification on the same edge.
 */
describe("VAD single processing", () => {
  beforeEach(() => {
    hsetMock.mockClear();
    expireMock.mockClear();
  });

  test("one VAD edge produces one history entry and one Redis persist", async () => {
    const identifier = new SpeakerIdentifier("test-session");
    const signal = makeSignal("vad_speaking");

    identifier.processVadSignal(signal);
    identifier.tryLateIdentification([]);
    await flushPersists();

    const state = identifier.exportSessionState();
    expect(state.vadHistory.length).toBe(1);
    expect(hsetMock).toHaveBeenCalledTimes(1);
    expect(expireMock).toHaveBeenCalledTimes(1);
  });

  test("speaking + silence edges produce two entries and two persists", async () => {
    const identifier = new SpeakerIdentifier("test-session");

    identifier.processVadSignal(makeSignal("vad_speaking"));
    identifier.processVadSignal(makeSignal("vad_silence"));
    await flushPersists();

    const state = identifier.exportSessionState();
    expect(state.vadHistory.length).toBe(2);
    expect(state.vadHistory.map((entry) => entry.type)).toEqual([
      "vad_speaking",
      "vad_silence",
    ]);
    expect(hsetMock).toHaveBeenCalledTimes(2);
    expect(expireMock).toHaveBeenCalledTimes(2);
  });

  test("late identification still correlates without reprocessing", () => {
    const identifier = new SpeakerIdentifier("test-session");
    identifier.registerTeamMember("u1", "Ada", "participant");

    const now = Date.now();
    identifier.processVadSignal({
      clientSendTs: now - 100,
      role: "participant",
      serverReceiveTs: now,
      sessionId: "test-session",
      type: "vad_speaking",
      userId: "u1",
    });

    const found = identifier.tryLateIdentification([
      { diarizationIndex: 1002, timestamp: now - 50 },
    ]);

    expect(found.length).toBe(1);
    expect(found[0]?.speaker.userId).toBe("u1");
    expect(identifier.exportSessionState().vadHistory.length).toBe(1);
  });
});
