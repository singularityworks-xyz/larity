import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// Import after mocks so the connection uses the fake client.
afterAll(() => mock.restore());

import { DeepgramConnection } from "./connection";

type Handler = (...args: unknown[]) => void;

class ManualLiveSocket {
  readonly handlers = new Map<string, Handler[]>();

  on(event: string, callback: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(callback);
    this.handlers.set(event, list);
  }

  connect(): void {
    // noop
  }

  waitForOpen(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.on("open", () => resolve(undefined));
      this.on("error", (error) => reject(error));
    });
  }

  sendMedia(): void {
    // noop
  }

  sendKeepAlive(): void {
    // noop
  }

  close(): void {
    // noop
  }
}

const seenConfigs: unknown[] = [];

mock.module("./client", () => ({
  getDeepgramClient: () => ({
    listen: {
      v1: {
        connect: (cfg: unknown) => {
          seenConfigs.push(cfg);
          return Promise.resolve(new ManualLiveSocket());
        },
      },
    },
  }),
}));

mock.module("@larity/db/redis", () => ({
  publishSystemEvent: () => Promise.resolve(),
  redis: {
    publish: () => Promise.resolve(1),
  },
}));

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * P5.7: lock the default connect query. Any default change here must come
 * with a measured decision-matrix entry in the plan.
 */
describe("Deepgram connect query defaults (P5.7)", () => {
  beforeEach(() => {
    seenConfigs.length = 0;
  });

  test("mic + sys channels both diarize with current endpointing", async () => {
    const mic = new DeepgramConnection("s1", 0);
    const sys = new DeepgramConnection("s1", 1);
    mic.preconnect();
    sys.preconnect();
    await tick(10);

    expect(seenConfigs).toHaveLength(2);
    for (const cfg of seenConfigs) {
      const query = cfg as Record<string, unknown>;
      expect(query.endpointing).toBe("450");
      expect(query.utterance_end_ms).toBe("1000");
      expect(query.diarize).toBe("true");
      expect(query).not.toHaveProperty("no_delay");
    }

    await mic.close();
    await sys.close();
  });
});
