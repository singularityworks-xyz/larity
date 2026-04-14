import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { promisify } from "node:util";
import Redis, { type Redis as RedisInstance } from "ioredis";

const sleep = promisify(setTimeout);

interface DockerContainer {
  process: ChildProcess;
  containerId?: string;
}

class RedisTestContainer {
  private container: DockerContainer | null = null;
  private readonly redisUrl = "redis://localhost:6379";

  start(): Promise<void> {
    console.log("Starting Redis test container...");

    const dockerProcess = spawn(
      "docker-compose",
      ["-f", "docker-compose.test.yml", "up", "-d"],
      {
        cwd: import.meta.dirname,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    this.container = { process: dockerProcess };

    return new Promise((resolve, reject) => {
      let _stdout = "";
      let stderr = "";

      dockerProcess.stdout?.on("data", (data) => {
        _stdout += data.toString();
      });

      dockerProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      dockerProcess.on("close", (code) => {
        if (code === 0) {
          console.log("Redis container started successfully");
          resolve();
        } else {
          console.error("Failed to start Redis container:", stderr);
          reject(
            new Error(`Docker Compose failed with code ${code}: ${stderr}`)
          );
        }
      });

      setTimeout(() => {
        dockerProcess.kill();
        reject(new Error("Timeout starting Redis container"));
      }, 60_000);
    });
  }

  async waitForReady(maxRetries = 30): Promise<void> {
    console.log("Waiting for Redis to be ready...");

    for (let i = 0; i < maxRetries; i++) {
      try {
        const testRedis = new Redis(this.redisUrl);
        await testRedis.ping();
        await testRedis.quit();
        console.log("Redis is ready!");
        return;
      } catch (_error) {
        console.log(`Redis not ready yet, retry ${i + 1}/${maxRetries}...`);
        await sleep(1000);
      }
    }

    throw new Error("Redis container failed to become ready");
  }

  async stop(): Promise<void> {
    console.log("Stopping Redis test container...");

    if (this.container) {
      try {
        const dockerProcess = spawn(
          "docker-compose",
          ["-f", "docker-compose.test.yml", "down", "-v"],
          {
            cwd: import.meta.dirname,
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        await new Promise((resolve, reject) => {
          dockerProcess.on("close", (code) => {
            if (code === 0) {
              console.log("Redis container stopped successfully");
              resolve(undefined);
            } else {
              console.error("Failed to stop Redis container");
              reject(new Error(`Docker Compose down failed with code ${code}`));
            }
          });

          setTimeout(() => {
            dockerProcess.kill();
            reject(new Error("Timeout stopping Redis container"));
          }, 30_000);
        });
      } catch (error) {
        console.error("Error stopping Redis container:", error);
      }
    }
  }

  getRedisUrl(): string {
    return this.redisUrl;
  }
}

const testContainer = new RedisTestContainer();
let redis: RedisInstance;

describe("Redis Integration Tests", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = testContainer.getRedisUrl();

    try {
      await testContainer.start();
      await testContainer.waitForReady();

      redis = new Redis(testContainer.getRedisUrl());
    } catch (error) {
      console.error("Failed to setup Redis test environment:", error);
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    try {
      if (redis) {
        await redis.quit();
      }
    } catch (error) {
      console.error("Error disconnecting Redis client:", error);
    }

    await testContainer.stop();
  }, 60_000);

  describe("Client Integration", () => {
    it("should connect to real Redis", async () => {
      const pong = await redis.ping();
      expect(pong).toBe("PONG");
    });

    it("should perform basic set/get operations", async () => {
      const key = "test:key";
      const value = "test_value";

      const setResult = await redis.set(key, value);
      expect(setResult).toBe("OK");

      const getResult = await redis.get(key);
      expect(getResult).toBe(value);

      await redis.del(key);
    });
  });

  describe("Health Check Integration", () => {
    it("should ping successfully", async () => {
      const pong = await redis.ping();
      expect(pong).toBe("PONG");
    });
  });

  describe("Keys Integration", () => {
    it("should generate and use real keys", async () => {
      const sessionId = "integration-test-session";
      const sttKey = `realtime:stt:${sessionId}`;
      const testValue = "integration test data";

      await redis.set(sttKey, testValue);
      const retrieved = await redis.get(sttKey);
      expect(retrieved).toBe(testValue);

      await redis.del(sttKey);
    });
  });

  describe("Locks Integration", () => {
    it("should acquire and release locks with real Redis", async () => {
      const lockKey = "locks:integration-test-lock";

      const acquired = await redis.set(lockKey, "1", "EX", 15, "NX");
      expect(acquired).toBe("OK");

      const acquiredAgain = await redis.set(lockKey, "1", "EX", 15, "NX");
      expect(acquiredAgain).toBeNull();

      await redis.del(lockKey);

      const acquiredAfterRelease = await redis.set(
        lockKey,
        "1",
        "EX",
        15,
        "NX"
      );
      expect(acquiredAfterRelease).toBe("OK");

      await redis.del(lockKey);
    });
  });

  describe("PubSub Integration", () => {
    it("should publish and subscribe to messages with real Redis", async () => {
      const channel = "integration-test-channel";
      const testMessage = { data: "test payload", timestamp: Date.now() };

      let receivedMessage: unknown = null;
      let messageReceived = false;

      const subscriber = new Redis(testContainer.getRedisUrl());
      await subscriber.subscribe(channel);

      subscriber.on("message", (receivedChannel, message) => {
        if (receivedChannel === channel) {
          receivedMessage = JSON.parse(message);
          messageReceived = true;
        }
      });

      await sleep(100);

      await redis.publish(channel, JSON.stringify(testMessage));

      let retries = 0;
      while (!messageReceived && retries < 50) {
        await sleep(100);
        retries++;
      }

      expect(messageReceived).toBe(true);
      expect(receivedMessage).toEqual(testMessage);

      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    });
  });

  describe("TTL Integration", () => {
    it("should respect TTL values with real Redis", async () => {
      const key = "realtime:stt:ttl-test-session";
      const value = "ttl test value";
      const ttl = 2;

      await redis.setex(key, ttl, value);

      let retrieved = await redis.get(key);
      expect(retrieved).toBe(value);

      await sleep(2500);

      retrieved = await redis.get(key);
      expect(retrieved).toBeNull();
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle multiple concurrent operations", async () => {
      const operations = Array.from({ length: 10 }, async (_, i) => {
        const key = `concurrent:test:${i}`;
        const value = `value-${i}`;

        await redis.set(key, value);
        const retrieved = await redis.get(key);
        await redis.del(key);

        return retrieved === value;
      });

      const results = await Promise.all(operations);
      expect(results.every((result) => result)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid operations gracefully", async () => {
      const result = await redis.get("non:existent:key");
      expect(result).toBeNull();

      const delResult = await redis.del("non:existent:key");
      expect(delResult).toBe(0);
    });
  });
});
