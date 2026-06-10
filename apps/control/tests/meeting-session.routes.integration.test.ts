import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { Elysia } from "elysia";

mock.module("../src/lib/auth", () => {
  return {
    auth: {
      api: {
        getSession: mock(async () => ({
          session: { id: "session-auth" },
          user: {
            id: "user-1",
            orgId: "org-1",
            role: "OWNER",
          },
        })),
      },
    },
  };
});

import { meetingSessionRoutes } from "../src/routes/meeting-session.routes";
import { meetingSessionService } from "../src/services/meeting-session.service";

describe("meetingSessionRoutes integration", () => {
  const app = new Elysia().use(meetingSessionRoutes);
  const startAdhocSpy = spyOn(meetingSessionService, "startAdhoc");
  const getActiveForOrgSpy = spyOn(meetingSessionService, "getActiveForOrg");
  const isValidSessionSpy = spyOn(meetingSessionService, "isValidSession");
  const updateConfigSpy = spyOn(meetingSessionService, "updateConfig");

  beforeEach(() => {
    startAdhocSpy.mockReset();
    getActiveForOrgSpy.mockReset();
    isValidSessionSpy.mockReset();
    updateConfigSpy.mockReset();
  });

  afterAll(() => {
    startAdhocSpy.mockRestore();
    getActiveForOrgSpy.mockRestore();
    isValidSessionSpy.mockRestore();
    updateConfigSpy.mockRestore();
  });

  it("starts ad-hoc session via POST /meeting-session/start-adhoc", async () => {
    startAdhocSpy.mockResolvedValue({
      sessionId: "session-1",
      meetingId: "meeting-1",
      status: "initializing",
      websocketUrl: "ws://localhost:9001/?sessionId=session-1",
      createdAt: 123,
      allowNameCustomization: true,
    });

    const response = await app.handle(
      new Request("http://local/meeting-session/start-adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
        }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      data: { sessionId: string };
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.sessionId).toBe("session-1");
    expect(startAdhocSpy).toHaveBeenCalledTimes(1);
    expect(startAdhocSpy).toHaveBeenCalledWith(
      {
        clientId: "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
      },
      "user-1"
    );
  });

  it("lists active sessions via GET /meeting-session/active", async () => {
    getActiveForOrgSpy.mockResolvedValue([
      {
        sessionId: "session-1",
        meetingId: "meeting-1",
        title: "Live sync",
        clientId: "client-1",
        clientName: "Acme",
        hostUserId: "user-1",
        hostName: "Host",
        startedAt: 123,
        participantCount: 3,
        allowNameCustomization: true,
      },
    ]);

    const response = await app.handle(
      new Request("http://local/meeting-session/active", {
        method: "GET",
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      data: Array<{ sessionId: string; allowNameCustomization?: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data[0]?.sessionId).toBe("session-1");
    expect(json.data[0]?.allowNameCustomization).toBe(true);
    expect(getActiveForOrgSpy).toHaveBeenCalledWith("user-1");
  });

  it("verifies start session response includes allowNameCustomization", async () => {
    startAdhocSpy.mockResolvedValue({
      sessionId: "session-1",
      meetingId: "meeting-1",
      status: "initializing",
      websocketUrl: "ws://localhost:9001/?sessionId=session-1",
      createdAt: 123,
      allowNameCustomization: true,
    });

    const response = await app.handle(
      new Request("http://local/meeting-session/start-adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
        }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      data: { allowNameCustomization?: boolean };
    };

    expect(json.data.allowNameCustomization).toBe(true);
  });

  it("updates session config via POST /meeting-session/:id/config", async () => {
    updateConfigSpy.mockResolvedValue(undefined);

    const response = await app.handle(
      new Request(
        "http://local/meeting-session/9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e/config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allowNameCustomization: false,
          }),
        }
      )
    );

    const json = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(updateConfigSpy).toHaveBeenCalledWith(
      "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
      "user-1",
      {
        allowNameCustomization: false,
      }
    );
  });

  it("rejects config update with invalid session ID", async () => {
    const response = await app.handle(
      new Request("http://local/meeting-session/not-a-uuid/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowNameCustomization: false }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects config update with missing body field", async () => {
    const response = await app.handle(
      new Request(
        "http://local/meeting-session/9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e/config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      )
    );

    expect(response.status).toBe(422);
  });
});
