import { afterAll, describe, expect, test } from "bun:test";
import { startServer, stopServer } from "./server";

let app: { stop: () => void } | null = null;
const PORT = 19_093;

async function connectTestSocket(): Promise<WebSocket> {
  const ws = new WebSocket(
    `ws://127.0.0.1:${PORT}/?sessionId=test-session-limits&userId=u1&role=host`
  );
  ws.binaryType = "arraybuffer";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), 5000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("connect error"));
    };
  });
  return ws;
}

describe("realtime WS limits (P1.10)", () => {
  test("oversize binary frames are rejected (64 KB maxPayloadLength)", async () => {
    process.env.REALTIME_PORT = String(PORT);
    app = await startServer();

    const ws = await connectTestSocket();
    const closed = new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(-1), 5000);
      ws.onclose = (event) => {
        clearTimeout(timer);
        resolve(event.code);
      };
    });
    ws.send(new Uint8Array(100 * 1024));

    const code = await closed;
    // Bun terminates oversize frames without a close frame (client sees
    // 1006); any close proves the limit is enforced.
    expect(code).not.toBe(-1);
  }, 15_000);

  test("small frames stay connected", async () => {
    const ws = await connectTestSocket();
    ws.send(new Uint8Array(1024));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close(1000);
  }, 15_000);

  afterAll(() => {
    if (app) {
      stopServer(app);
      app = null;
    }
  });
});
