// Test environment setup - must be before any imports
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "error";

import { afterEach, describe, expect, it } from "bun:test";

// We need to test the validateSession function
// Since it makes HTTP calls, we'll mock fetch for unit tests

describe("Validate Session Tests", () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should allow test-session bypass in non-production", async () => {
    process.env.NODE_ENV = "development";
    global.fetch = (() => {
      throw new Error("fetch should not be called for test-session bypass");
    }) as typeof fetch;

    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("local-test-session-123");

    expect(result.isValid).toBe(true);
    expect(result.orgId).toBe("default");
  });

  it("should not bypass test-session in production", async () => {
    process.env.NODE_ENV = "production";
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { valid: false } }),
      })) as typeof fetch;

    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("local-test-session-123");

    expect(result.isValid).toBe(false);
  });

  it("should return true for valid session response", async () => {
    // Mock fetch to return a valid response
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { valid: true, orgId: "org-123" },
          }),
      })) as any;

    // Import dynamically to use mocked fetch
    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("valid-session-id");

    expect(result.isValid).toBe(true);
    expect(result.orgId).toBe("org-123");
  });

  it("should return false for invalid session response", async () => {
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { valid: false },
          }),
      })) as any;

    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("invalid-session-id");

    expect(result.isValid).toBe(false);
  });

  it("should return false for non-ok HTTP response", async () => {
    global.fetch = (() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      })) as any;

    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("non-existent-session");

    expect(result.isValid).toBe(false);
  });

  it("should return false (secure default) when fetch throws an error", async () => {
    global.fetch = (() => Promise.reject(new Error("Network error"))) as any;

    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("error-session");

    // In prod, errors must reject the connection
    expect(result.isValid).toBe(false);
  });

  it("should return false for malformed response", async () => {
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ invalid: "structure" }),
      })) as any;

    const { validateSession } = await import(
      "../src/handlers/validate-session"
    );
    const result = await validateSession("malformed-session");

    expect(result.isValid).toBe(false);
  });
});
