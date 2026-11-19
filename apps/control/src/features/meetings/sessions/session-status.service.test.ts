import { describe, expect, mock, test } from "bun:test";
import { redisKeys } from "@larity/db/redis/keys";
import { getSessionStatus, isValidSession } from "./session-status.service";

function sessionReader(record: Record<string, string>) {
  return {
    hgetall: () => Promise.resolve(record),
    sismember: mock(() => Promise.resolve(1)),
  };
}

describe("session status and authorization", () => {
  test("rejects missing or incomplete session records", async () => {
    const reader = sessionReader({ sessionId: "session" });
    expect(await getSessionStatus("session", reader)).toBeNull();
    expect(await isValidSession("session", undefined, undefined, reader)).toBe(
      false
    );
  });

  test("requires the host identity or participant membership", async () => {
    const reader = sessionReader({ userId: "host" });
    const membership = reader.sismember;

    expect(await isValidSession("session", "host", "host", reader)).toBe(true);
    expect(await isValidSession("session", "other", "host", reader)).toBe(
      false
    );
    expect(
      await isValidSession("session", "guest", "participant", reader)
    ).toBe(true);
    expect(membership).toHaveBeenCalledWith(
      redisKeys.sessionParticipants("session"),
      "guest"
    );
    membership.mockResolvedValue(0);
    expect(
      await isValidSession("session", "guest", "participant", reader)
    ).toBe(false);
    expect(await isValidSession("session", "host", undefined, reader)).toBe(
      false
    );
  });
});
