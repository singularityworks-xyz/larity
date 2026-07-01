import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

mock.module("@larity/db/redis", () => ({
  redis: {
    get: mock().mockResolvedValue(null),
    set: mock().mockResolvedValue("OK"),
    hget: mock().mockResolvedValue(null),
  },
}));

import { auth } from "../lib/auth";
import { app } from "../server";
import {
  ClientService,
  MeetingService,
  PolicyGuardrailService,
} from "../services";

describe("Tenant Isolation (Routes)", () => {
  const MOCK_ORG_ID = "org_123";
  const MOCK_USER_ID = "user_123";
  const MOCK_MEETING_ID = "123e4567-e89b-12d3-a456-426614174000"; // Valid UUID
  const MOCK_SESSION_TOKEN = "valid_token";

  beforeEach(() => {
    // Reset all spies
    spyOn(auth.api, "getSession").mockReset();
    // @ts-expect-error PrismaPromise mock
    spyOn(MeetingService, "findAll").mockImplementation(async () => []);
    // @ts-expect-error PrismaPromise mock
    spyOn(MeetingService, "findById").mockImplementation(async () => ({
      id: MOCK_MEETING_ID,
    }));

    // @ts-expect-error PrismaPromise mock
    spyOn(ClientService, "findById").mockImplementation(async () => ({
      id: "client_123",
    }));
    // @ts-expect-error PrismaPromise mock
    spyOn(PolicyGuardrailService, "findAll").mockImplementation(async () => []);
  });

  it("should block requests without authentication", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/meetings", {
        method: "GET",
      })
    );
    expect(response.status).toBe(401);
  });

  it("should block requests without an organization ID", async () => {
    spyOn(auth.api, "getSession").mockResolvedValue({
      session: {
        id: "session_123",
        userId: MOCK_USER_ID,
        expiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "test",
      },
      user: {
        id: MOCK_USER_ID,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: "USER",
        onboardingCompleted: true,
      },
    } as any);

    const response = await app.handle(
      new Request("http://localhost/api/meetings", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MOCK_SESSION_TOKEN}`,
        },
      })
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("This action requires an active organization");
  });

  it("should pass orgId to MeetingService when listing meetings", async () => {
    spyOn(auth.api, "getSession").mockResolvedValue({
      session: {
        id: "session_123",
        userId: MOCK_USER_ID,
        expiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "test",
      },
      user: {
        id: MOCK_USER_ID,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: "USER",
        onboardingCompleted: true,
        orgId: MOCK_ORG_ID,
      },
    } as any);

    const response = await app.handle(
      new Request("http://localhost/api/meetings", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MOCK_SESSION_TOKEN}`,
        },
      })
    );
    expect(response.status).toBe(200);

    expect(MeetingService.findAll).toHaveBeenCalled();
    const callArgs = (MeetingService.findAll as any).mock.calls[0];
    expect(callArgs[0]).toBe(MOCK_ORG_ID);
  });

  it("should pass orgId to MeetingService when fetching a specific meeting", async () => {
    spyOn(auth.api, "getSession").mockResolvedValue({
      session: {
        id: "session_123",
        userId: MOCK_USER_ID,
        expiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "test",
      },
      user: {
        id: MOCK_USER_ID,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: "USER",
        onboardingCompleted: true,
        orgId: MOCK_ORG_ID,
      },
    } as any);

    const response = await app.handle(
      new Request(`http://localhost/api/meetings/${MOCK_MEETING_ID}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MOCK_SESSION_TOKEN}`,
        },
      })
    );
    expect(response.status).toBe(200);

    expect(MeetingService.findById).toHaveBeenCalled();
    const callArgs = (MeetingService.findById as any).mock.calls[0];
    expect(callArgs[0]).toBe(MOCK_MEETING_ID);
    expect(callArgs[1]).toBe(MOCK_ORG_ID);
  });

  it("should pass orgId to ClientService when fetching a client", async () => {
    spyOn(auth.api, "getSession").mockResolvedValue({
      session: {
        id: "session_123",
        userId: MOCK_USER_ID,
        expiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "test",
      },
      user: {
        id: MOCK_USER_ID,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: "USER",
        onboardingCompleted: true,
        orgId: MOCK_ORG_ID,
      },
    } as any);

    const _response = await app.handle(
      new Request(
        "http://localhost/api/clients/123e4567-e89b-12d3-a456-426614174000",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${MOCK_SESSION_TOKEN}`,
          },
        }
      )
    );

    expect(ClientService.findById).toHaveBeenCalled();
    const callArgs = (ClientService.findById as any).mock.calls[0];
    expect(callArgs[0]).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(callArgs[1]).toBe(MOCK_ORG_ID);
  });

  it("should pass orgId to PolicyGuardrailService when listing guardrails", async () => {
    spyOn(auth.api, "getSession").mockResolvedValue({
      session: {
        id: "session_123",
        userId: MOCK_USER_ID,
        expiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "test",
      },
      user: {
        id: MOCK_USER_ID,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: "USER",
        onboardingCompleted: true,
        orgId: MOCK_ORG_ID,
      },
    } as any);

    const _response = await app.handle(
      new Request(
        "http://localhost/api/policy-guardrails?orgId=123e4567-e89b-12d3-a456-426614174000",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${MOCK_SESSION_TOKEN}`,
          },
        }
      )
    );

    expect(PolicyGuardrailService.findAll).toHaveBeenCalled();
    const callArgs = (PolicyGuardrailService.findAll as any).mock.calls[0];
    expect(callArgs[0]).toBe(MOCK_ORG_ID); // The orgId from auth should override query.orgId
  });
});
