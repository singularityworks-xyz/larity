import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { MeetingSessionError } from "./meeting-session.errors";

const getSession = mock(async () => null as unknown);
const start = mock(async () => ({
  sessionId: "session-1",
  meetingId: "123e4567-e89b-12d3-a456-426614174000",
  status: "initializing" as const,
  websocketUrl: "ws://localhost:9001",
  createdAt: 1,
  allowNameCustomization: true,
}));

const serviceMethods = {
  end: mock(async () => ({ success: true, meetingId: "meeting-1" })),
  getActiveForOrg: mock(async () => []),
  getByMeetingId: mock(async () => null),
  getStatus: mock(async () => null),
  isValidSession: mock(async () => false),
  join: mock(async () => ({
    success: true,
    sessionId: "session-1",
    meetingId: "meeting-1",
    role: "participant" as const,
    websocketUrl: "ws://localhost:9001",
    joinedAt: 1,
    allowNameCustomization: true,
  })),
  start,
  startAdhoc: mock(async () => ({
    sessionId: "session-1",
    meetingId: "meeting-1",
    status: "initializing" as const,
    websocketUrl: "ws://localhost:9001",
    createdAt: 1,
    allowNameCustomization: true,
  })),
  updateConfig: mock(async () => undefined),
};

mock.module("../../../lib/auth", () => ({
  auth: { api: { getSession } },
}));
const { createMeetingSessionRoutes } = await import("./meeting-session.routes");
const app = new Elysia().use(createMeetingSessionRoutes(serviceMethods));
const meetingId = "123e4567-e89b-12d3-a456-426614174000";

function startRequest(): Request {
  return new Request("http://localhost/meeting-session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId }),
  });
}

beforeEach(() => {
  getSession.mockClear();
  getSession.mockImplementation(async () => null);
  start.mockClear();
  start.mockResolvedValue({
    sessionId: "session-1",
    meetingId,
    status: "initializing",
    websocketUrl: "ws://localhost:9001",
    createdAt: 1,
    allowNameCustomization: true,
  });
});

afterAll(() => mock.restore());

describe("meeting session routes", () => {
  test("rejects unauthenticated session starts before dispatch", async () => {
    getSession.mockResolvedValue(null);

    const response = await app.handle(startRequest());

    expect(response.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  test("maps a service conflict to the public status and error shape", async () => {
    getSession.mockResolvedValue({
      session: { id: "auth-session" },
      user: { id: "user-1" },
    });
    start.mockRejectedValue(
      new MeetingSessionError(
        "Meeting already has an active session",
        "SESSION_EXISTS"
      )
    );

    const response = await app.handle(startRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "SESSION_EXISTS",
      message: "Meeting already has an active session",
    });
    expect(start).toHaveBeenCalledWith({ meetingId }, "user-1");
  });

  test("routes a valid authenticated start to the session service", async () => {
    getSession.mockResolvedValue({
      session: { id: "auth-session" },
      user: { id: "user-1" },
    });

    const response = await app.handle(startRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { sessionId: "session-1", meetingId },
    });
    expect(start).toHaveBeenCalledWith({ meetingId }, "user-1");
  });
});
