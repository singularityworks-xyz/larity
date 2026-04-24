import { beforeEach, describe, expect, it, mock } from "bun:test";

const getSessionMock = mock();

mock.module("../lib/auth-client", () => ({
  authClient: {
    getSession: getSessionMock,
  },
}));

import {
  authGateLoader,
  guestOnlyLoader,
  onboardingLoader,
  rootIndexLoader,
} from "./_guard";

interface SessionPayload {
  data: {
    user: {
      orgId?: string | null;
    };
  } | null;
}

function sessionResponse(orgId?: string | null): SessionPayload {
  if (orgId === undefined) {
    return { data: { user: {} } };
  }

  return {
    data: {
      user: {
        orgId,
      },
    },
  };
}

async function expectRedirect(
  promise: Promise<unknown>,
  location: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected redirect");
  } catch (error) {
    if (!(error instanceof Response)) {
      throw new Error("Expected a redirect Response");
    }
    if (error.status !== 302) {
      throw new Error(`Expected status 302, got ${error.status}`);
    }
    if (error.headers.get("Location") !== location) {
      throw new Error(
        `Expected location ${location}, got ${error.headers.get("Location")}`
      );
    }
  }
}

describe("route guards", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("root index redirects unauthenticated users to login", async () => {
    getSessionMock.mockResolvedValue({ data: null });

    await expectRedirect(rootIndexLoader(), "/login");
  });

  it("root index redirects org-less users to onboarding", async () => {
    getSessionMock.mockResolvedValue(sessionResponse(null));

    await expectRedirect(rootIndexLoader(), "/onboarding");
  });

  it("root index redirects org members to dashboard", async () => {
    getSessionMock.mockResolvedValue(sessionResponse("org-1"));

    await expectRedirect(rootIndexLoader(), "/dashboard");
  });

  it("auth gate redirects unauthenticated users", async () => {
    getSessionMock.mockResolvedValue({ data: null });

    await expectRedirect(
      authGateLoader({ request: new Request("http://local/dashboard") }),
      "/login"
    );
  });

  it("auth gate redirects org-less users to onboarding", async () => {
    getSessionMock.mockResolvedValue(sessionResponse(null));

    await expectRedirect(
      authGateLoader({ request: new Request("http://local/dashboard") }),
      "/onboarding"
    );
  });

  it("auth gate allows authenticated org members", async () => {
    getSessionMock.mockResolvedValue(sessionResponse("org-1"));

    const result = await authGateLoader({
      request: new Request("http://local/dashboard"),
    });

    expect(result).toBeNull();
  });

  it("guest loader redirects authenticated users to dashboard", async () => {
    getSessionMock.mockResolvedValue(sessionResponse("org-1"));

    await expectRedirect(
      guestOnlyLoader({ request: new Request("http://local/login") }),
      "/dashboard"
    );
  });

  it("onboarding loader redirects unauthenticated users to login", async () => {
    getSessionMock.mockResolvedValue({ data: null });

    await expectRedirect(
      onboardingLoader({ request: new Request("http://local/onboarding") }),
      "/login"
    );
  });

  it("onboarding loader allows org-less users", async () => {
    getSessionMock.mockResolvedValue(sessionResponse(null));

    const result = await onboardingLoader({
      request: new Request("http://local/onboarding/create-org"),
    });

    expect(result).toBeNull();
  });
});
