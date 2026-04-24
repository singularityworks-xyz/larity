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

mock.module("../lib/auth", () => {
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

import { meetingSessionService } from "../services/meeting-session.service";
import { meetingSessionRoutes } from "./meeting-session.routes";

describe("meetingSessionRoutes integration", () => {
  const app = new Elysia().use(meetingSessionRoutes);
  const startAdhocSpy = spyOn(meetingSessionService, "startAdhoc");
  const getActiveForOrgSpy = spyOn(meetingSessionService, "getActiveForOrg");
  const isValidSessionSpy = spyOn(meetingSessionService, "isValidSession");

  beforeEach(() => {
    startAdhocSpy.mockReset();
    getActiveForOrgSpy.mockReset();
    isValidSessionSpy.mockReset();
  });

  afterAll(() => {
    startAdhocSpy.mockRestore();
    getActiveForOrgSpy.mockRestore();
    isValidSessionSpy.mockRestore();
  });

  it("starts ad-hoc session via POST /meeting-session/start-adhoc", async () => {
    startAdhocSpy.mockResolvedValue({
      sessionId: "session-1",
      meetingId: "meeting-1",
      status: "initializing",
      websocketUrl: "ws://localhost:9001/?sessionId=session-1",
      createdAt: 123,
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
      },
    ]);

    const response = await app.handle(
      new Request("http://local/meeting-session/active", {
        method: "GET",
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      data: Array<{ sessionId: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data[0]?.sessionId).toBe("session-1");
    expect(getActiveForOrgSpy).toHaveBeenCalledWith("user-1");
  });
});
