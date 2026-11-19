import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import { getSessionStatus, isValidSession } from "./session-status.service";

afterEach(() => {
  mock.restore();
});

describe("session status and authorization", () => {
  test("rejects missing or incomplete session records", async () => {
    spyOn(redis, "hgetall").mockResolvedValue({ sessionId: "session" });
    expect(await getSessionStatus("session")).toBeNull();
    expect(await isValidSession("session")).toBe(false);
  });

  test("requires the host identity or participant membership", async () => {
    spyOn(redis, "hgetall").mockResolvedValue({ userId: "host" });
    const membership = spyOn(redis, "sismember").mockResolvedValue(1);

    expect(await isValidSession("session", "host", "host")).toBe(true);
    expect(await isValidSession("session", "other", "host")).toBe(false);
    expect(await isValidSession("session", "guest", "participant")).toBe(true);
    expect(membership).toHaveBeenCalledWith(
      redisKeys.sessionParticipants("session"),
      "guest"
    );
    membership.mockResolvedValue(0);
    expect(await isValidSession("session", "guest", "participant")).toBe(false);
    expect(await isValidSession("session", "host")).toBe(false);
  });
});
