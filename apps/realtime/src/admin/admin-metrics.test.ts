import { afterEach, describe, expect, test } from "bun:test";
import {
  type getMetricsSnapshot,
  recordHistogram,
  resetMetrics,
} from "@larity/stt/metrics";
import { Elysia } from "elysia";
import { addAdminRoutes } from "./admin";

function makeApp(): Elysia {
  const app = new Elysia();
  addAdminRoutes(app);
  return app;
}

const originalAdminKey = process.env.ADMIN_API_KEY;

afterEach(() => {
  if (originalAdminKey === undefined) {
    delete process.env.ADMIN_API_KEY;
  } else {
    process.env.ADMIN_API_KEY = originalAdminKey;
  }
});

describe("GET /admin/metrics", () => {
  test("returns aggregate metrics snapshot as JSON when no key is configured", async () => {
    delete process.env.ADMIN_API_KEY;
    resetMetrics();
    recordHistogram("stt.deepgram_connect_ms", 123);

    const res = await makeApp().handle(
      new Request("http://localhost/admin/metrics")
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ReturnType<typeof getMetricsSnapshot>;
    expect(body.histograms["stt.deepgram_connect_ms"]?.count).toBe(1);
    expect(body.histograms["stt.deepgram_connect_ms"]?.min).toBe(123);
    expect(body.counters).toEqual({});
  });

  test("rejects unauthenticated scrapes once a key is configured", async () => {
    process.env.ADMIN_API_KEY = "secret-key";

    const res = await makeApp().handle(
      new Request("http://localhost/admin/metrics")
    );
    expect(res.status).toBe(401);

    const wrongKey = await makeApp().handle(
      new Request("http://localhost/admin/metrics", {
        headers: { authorization: "Bearer wrong-key" },
      })
    );
    expect(wrongKey.status).toBe(401);

    const authorized = await makeApp().handle(
      new Request("http://localhost/admin/metrics", {
        headers: { authorization: "Bearer secret-key" },
      })
    );
    expect(authorized.status).toBe(200);
  });
});
