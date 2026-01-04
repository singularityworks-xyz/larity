import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock ioredis before importing our modules
mock.module('ioredis', () => {
  return {
    default: mock(() => ({
      connect: mock(() => Promise.resolve()),
      ping: mock(() => Promise.resolve('PONG')),
      set: mock(() => Promise.resolve('OK')),
      get: mock(() => Promise.resolve('test_value')),
      del: mock(() => Promise.resolve(1)),
      publish: mock(() => Promise.resolve(1)),
    }))
  };
});

// Import the modules to test (after mocking)
import { redis, connectRedis } from '../client';
import { checkRedisHealth } from '../health';
import { redisKeys } from '../keys';
import { acquireLock, releaseLock } from '../locks';
import { publish } from '../pubsub';
import { TTL } from '../ttl';

describe('Redis Infrastructure Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    // Note: Since we're using mock.module, the mocks are automatically reset
  });

  describe('Client Module', () => {
    describe('redis instance', () => {
      it('should export redis instance', () => {
        expect(redis).toBeDefined();
        expect(typeof redis).toBe('object');
      });

      it('should have Redis methods available', () => {
        expect(typeof redis.connect).toBe('function');
        expect(typeof redis.ping).toBe('function');
        expect(typeof redis.set).toBe('function');
        expect(typeof redis.get).toBe('function');
        expect(typeof redis.del).toBe('function');
        expect(typeof redis.publish).toBe('function');
      });
    });

    describe('connectRedis', () => {
      it('should successfully connect to Redis', async () => {
        const result = await connectRedis();
        expect(result).toBe(true);
      });

      it('should handle connection errors gracefully', async () => {
        // Mock connect to throw error
        redis.connect = mock(() => Promise.reject(new Error('Connection failed')));

        const result = await connectRedis();
        expect(result).toBe(false);
      });
    });
  });

  describe('Health Module', () => {
    describe('checkRedisHealth', () => {
      it('should return healthy status when Redis is working', async () => {
        // Mock Date.now to return a consistent value
        const mockTimestamp = 1234567890123;
        const originalDateNow = Date.now;
        Date.now = mock(() => mockTimestamp);

        const expectedTestValue = `health_check_${mockTimestamp}`;

        redis.ping = mock(() => Promise.resolve('PONG' as const));
        redis.set = mock(() => Promise.resolve('OK' as const));
        redis.get = mock(() => Promise.resolve(expectedTestValue));
        redis.del = mock(() => Promise.resolve(1));

        const result = await checkRedisHealth();

        // Restore original Date.now
        Date.now = originalDateNow;

        expect(result.healthy).toBe(true);
        expect(result.latency).toBeDefined();
        expect(typeof result.latency).toBe('number');
        expect(result.timestamp).toBeDefined();
        expect(result.error).toBeUndefined();
      });

      it('should return unhealthy status when ping fails', async () => {
        redis.ping = mock(() => Promise.reject(new Error('Ping failed')));

        const result = await checkRedisHealth();

        expect(result.healthy).toBe(false);
        expect(result.error).toBe('Ping failed');
        expect(result.latency).toBeDefined();
        expect(result.timestamp).toBeDefined();
      });

      it('should return unhealthy status when set/get fails', async () => {
        const wrongValue = 'wrong_value';
        redis.ping = mock(() => Promise.resolve('PONG' as const));
        redis.set = mock(() => Promise.resolve('OK' as const));
        redis.get = mock(() => Promise.resolve(wrongValue));
        redis.del = mock(() => Promise.resolve(1));

        const result = await checkRedisHealth();

        expect(result.healthy).toBe(false);
        expect(result.error).toBe('Redis set/get operation failed');
      });

      it('should handle unknown errors', async () => {
        redis.ping = mock(() => Promise.reject('Unknown error type'));

        const result = await checkRedisHealth();

        expect(result.healthy).toBe(false);
        expect(result.error).toBe('Unknown error');
      });
    });
  });

  describe('Keys Module', () => {
    describe('redisKeys', () => {
      it('should generate STT key correctly', () => {
        const sessionId = 'session-123';
        const expected = 'realtime:stt:session-123';
        expect(redisKeys.stt(sessionId)).toBe(expected);
      });

      it('should generate intent key correctly', () => {
        const sessionId = 'session-456';
        const expected = 'realtime:intent:session-456';
        expect(redisKeys.intent(sessionId)).toBe(expected);
      });

      it('should generate meeting buffer key correctly', () => {
        const meetingId = 'meeting-789';
        const expected = 'buffers:meeting:meeting-789';
        expect(redisKeys.meetingBuffer(meetingId)).toBe(expected);
      });

      it('should generate lock key correctly', () => {
        const name = 'my-lock';
        const expected = 'locks:my-lock';
        expect(redisKeys.lock(name)).toBe(expected);
      });

      it('should generate cache user key correctly', () => {
        const userId = 'user-123';
        const expected = 'cache:user:user-123';
        expect(redisKeys.cacheUser(userId)).toBe(expected);
      });

      it('should generate health key correctly', () => {
        const expected = 'health:check';
        expect(redisKeys.health()).toBe(expected);
      });
    });
  });

  describe('Locks Module', () => {
    describe('acquireLock', () => {
      it('should successfully acquire a lock', async () => {
        redis.set = mock(() => Promise.resolve('OK' as const));

        const result = await acquireLock('test-lock');

        expect(result).toBe(true);
      });

      it('should fail to acquire lock when already locked', async () => {
        redis.set = mock(() => Promise.resolve(null as any));

        const result = await acquireLock('test-lock');

        expect(result).toBe(false);
      });

      it('should handle Redis errors during lock acquisition', async () => {
        redis.set = mock(() => Promise.reject(new Error('Redis error')));

        await expect(acquireLock('test-lock')).rejects.toThrow('Redis error');
      });
    });

    describe('releaseLock', () => {
      it('should successfully release a lock', async () => {
        redis.del = mock(() => Promise.resolve(1));

        await releaseLock('test-lock');
      });

      it('should handle Redis errors during lock release', async () => {
        redis.del = mock(() => Promise.reject(new Error('Redis error')));

        await expect(releaseLock('test-lock')).rejects.toThrow('Redis error');
      });
    });
  });

  describe('PubSub Module', () => {
    describe('publish', () => {
      it('should publish message to channel', async () => {
        const channel = 'test-channel';
        const payload = { message: 'hello', timestamp: 123456 };

        redis.publish = mock(() => Promise.resolve(1));

        await publish(channel, payload);
      });

      it('should handle complex payload objects', async () => {
        const channel = 'complex-channel';
        const payload = {
          nested: {
            data: [1, 2, 3],
            metadata: { type: 'test' }
          },
          timestamp: Date.now()
        };

        redis.publish = mock(() => Promise.resolve(1));

        await publish(channel, payload);
      });

      it('should handle Redis errors during publishing', async () => {
        redis.publish = mock(() => Promise.reject(new Error('Publish failed')));

        await expect(publish('test-channel', 'test')).rejects.toThrow('Publish failed');
      });
    });
  });

  describe('TTL Module', () => {
    describe('TTL constants', () => {
      it('should have correct STT TTL value', () => {
        expect(TTL.STT).toBe(120);
      });

      it('should have correct INTENT TTL value', () => {
        expect(TTL.INTENT).toBe(180);
      });

      it('should have correct MEETING_BUFFER TTL value', () => {
        expect(TTL.MEETING_BUFFER).toBe(3600);
      });

      it('should have correct CACHE_SHORT TTL value', () => {
        expect(TTL.CACHE_SHORT).toBe(600);
      });

      it('should have correct CACHE_LONG TTL value', () => {
        expect(TTL.CACHE_LONG).toBe(1800);
      });

      it('should have correct LOCK TTL value', () => {
        expect(TTL.LOCK).toBe(15);
      });
    });
  });
});
