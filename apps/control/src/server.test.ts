import { describe, expect, it } from "bun:test";
import { app } from "./server";

describe("control server contract", () => {
  it("responds to /health endpoint with ok status", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const data = (await res.json()) as { status: string; timestamp: string };
    expect(data.status).toBe("ok");
    expect(typeof data.timestamp).toBe("string");
  });

  it("returns 404 for non-existent routes", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/nonexistent-route-path")
    );
    expect(res.status).toBe(404);
  });
});
