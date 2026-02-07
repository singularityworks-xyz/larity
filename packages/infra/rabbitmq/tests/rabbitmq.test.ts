import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ConsumeMessage } from "amqplib";

// Mock amqplib
const mockChannel = {
  prefetch: mock(() => Promise.resolve()),
  consume: mock(
    (_queue: string, _onMessage: (msg: ConsumeMessage | null) => void) =>
      Promise.resolve({ consumerTag: "test-tag" })
  ),
  ack: mock(),
  nack: mock(),
  publish: mock(() => true),
  assertExchange: mock(() => Promise.resolve()),
  assertQueue: mock(() => Promise.resolve({ queue: "test-queue" })),
  bindQueue: mock(() => Promise.resolve()),
  waitForConfirms: mock(() => Promise.resolve()),
  on: mock(),
  close: mock(() => Promise.resolve()),
};

const mockConnection = {
  createConfirmChannel: mock(() => Promise.resolve(mockChannel)),
  on: mock(),
  close: mock(() => Promise.resolve()),
};

mock.module("amqplib", () => {
  return {
    default: {
      connect: mock(() => Promise.resolve(mockConnection)),
    },
  };
});

// Import modules after mocking
import { closeConnection, getChannel } from "../connection";
import { consume } from "../consume";
import { Exchanges, setupExchanges } from "../exchanges";
import { publish } from "../publish";
import { setupQueues } from "../queues";

describe("RabbitMQ Infrastructure Unit Tests", () => {
  beforeEach(async () => {
    // Reset mocks
    mockChannel.prefetch.mockClear();
    mockChannel.consume.mockClear();
    mockChannel.ack.mockClear();
    mockChannel.nack.mockClear();
    mockChannel.publish.mockClear();
    mockChannel.assertExchange.mockClear();
    mockChannel.assertQueue.mockClear();
    mockChannel.bindQueue.mockClear();
    mockChannel.waitForConfirms.mockClear();
    mockChannel.on.mockClear();

    // Reset connection module state by closing it
    await closeConnection();
  });

  describe("Connection Module", () => {
    it("should establish connection and channel", async () => {
      const ch = await getChannel();
      expect(ch).toBeDefined();
      expect(mockChannel.prefetch).toHaveBeenCalled();
    });

    it("should return existing channel if already connected", async () => {
      const ch1 = await getChannel();
      const ch2 = await getChannel();
      expect(ch1).toBe(ch2);
    });
  });

  describe("Consume Module", () => {
    it("should set up consumer on queue", async () => {
      const handler = mock(() => Promise.resolve());
      await consume("test-queue", handler);

      expect(mockChannel.consume).toHaveBeenCalledWith(
        "test-queue",
        expect.any(Function)
      );
    });

    it("should process message and ack on success", async () => {
      const handler = mock(() => Promise.resolve());

      // Manually trigger the consumer callback
      mockChannel.consume.mockImplementation(
        async (
          _queue: string,
          callback: (msg: ConsumeMessage | null) => void
        ) => {
          const msg = {
            content: Buffer.from(JSON.stringify({ data: "test" })),
          } as ConsumeMessage;
          await callback(msg);
          return { consumerTag: "test" };
        }
      );

      await consume("test-queue", handler);

      expect(handler).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalled();
    });

    it("should nack on JSON parse error", async () => {
      const handler = mock(() => Promise.resolve());

      mockChannel.consume.mockImplementation(
        async (
          _queue: string,
          callback: (msg: ConsumeMessage | null) => void
        ) => {
          const msg = {
            content: Buffer.from("invalid-json"),
          } as ConsumeMessage;
          await callback(msg);
          return { consumerTag: "test" };
        }
      );

      await consume("test-queue", handler);

      expect(handler).not.toHaveBeenCalled();
      // Inspect calls safely or use specific matcher
      expect(mockChannel.nack).toHaveBeenCalled();

      // We can rely on toHaveBeenCalled for now as it confirms the error path
    });

    it("should nack on handler error", async () => {
      const handler = mock(() => Promise.reject(new Error("Handler failed")));

      mockChannel.consume.mockImplementation(
        async (
          _queue: string,
          callback: (msg: ConsumeMessage | null) => void
        ) => {
          const msg = {
            content: Buffer.from(JSON.stringify({ data: "test" })),
          } as ConsumeMessage;
          await callback(msg);
          return { consumerTag: "test" };
        }
      );

      await consume("test-queue", handler);

      expect(handler).toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalled();
    });
  });

  describe("Publish Module", () => {
    it("should publish message to exchange", async () => {
      const payload = { test: "data" };
      await publish("test-routing-key", payload);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        Exchanges.EVENTS,
        "test-routing-key",
        expect.any(Buffer),
        expect.objectContaining({
          contentType: "application/json",
          persistent: true,
        })
      );
      expect(mockChannel.waitForConfirms).toHaveBeenCalled();
    });

    it("should publish to specified exchange", async () => {
      const payload = { test: "data" };
      await publish("test-routing-key", payload, "custom-exchange");

      expect(mockChannel.publish).toHaveBeenCalledWith(
        "custom-exchange",
        "test-routing-key",
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe("Setup Modules", () => {
    it("should set up exchanges", async () => {
      await setupExchanges();

      expect(mockChannel.assertExchange).toHaveBeenCalledTimes(2); // EVENTS and JOBS
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        Exchanges.EVENTS,
        "topic",
        expect.objectContaining({ durable: true })
      );
    });

    it("should set up queues and bindings", async () => {
      await setupQueues();

      // Should create DLX
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        "ex.dlx",
        "topic",
        expect.any(Object)
      );

      // Check for queue assertions
      expect(mockChannel.assertQueue).toHaveBeenCalled();

      // Check for bindings
      expect(mockChannel.bindQueue).toHaveBeenCalled();
    });
  });
});
