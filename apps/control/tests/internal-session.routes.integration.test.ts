import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";
import { internalSessionRoutes } from "../src/routes/internal-session.routes";
import { meetingSessionService } from "../src/services/meeting-session.service";

describe("internalSessionRoutes integration", () => {
  const app = new Elysia().use(internalSessionRoutes);
  const isValidSessionSpy = spyOn(meetingSessionService, "isValidSession");

  beforeEach(() => {
    isValidSessionSpy.mockReset();
  });

  afterAll(() => {
    isValidSessionSpy.mockRestore();
  });

  it("validates sessions via POST /internal/meeting-session/:id/validate", async () => {
    isValidSessionSpy.mockResolvedValue(true);

    const response = await app.handle(
      new Request(
        "http://local/internal/meeting-session/session-xyz/validate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "user-1", role: "participant" }),
        }
      )
    );

    const json = (await response.json()) as {
      success: boolean;
      data: { valid: boolean };
    };

    expect(response.status).toBe(200);
    expect(json.data.valid).toBe(true);
    expect(isValidSessionSpy).toHaveBeenCalledWith(
      "session-xyz",
      "user-1",
      "participant"
    );
  });
});
