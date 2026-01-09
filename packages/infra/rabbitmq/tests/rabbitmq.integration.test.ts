import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { promisify } from 'node:util';
import amqp from 'amqplib';

import { closeConnection } from '../connection';
import { consume } from '../consume';
import { setupRabbitMQ } from '../index';
import { publish } from '../publish';
import { Queues } from '../queues';

const sleep = promisify(setTimeout);

class RabbitMQTestContainer {
  private containerId: string | null = null;
  private amqpUrl = 'amqp://larity:larity_dev@localhost:5672';

  async start(): Promise<void> {
    console.log('Starting RabbitMQ test container via docker run...');

    // Ensure any stale container is gone
    try {
      execSync('docker rm -f rabbitmq-integration-test', { stdio: 'ignore' });
    } catch (_e) {
      // ignore
    }

    // Run docker container directly
    // Using --rm to auto-clean if the process dies, but we'll manage lifecycle manually
    const cmd = [
      'docker',
      'run',
      '-d',
      '--name',
      'rabbitmq-integration-test',
      '-p',
      '5672:5672',
      '-p',
      '15672:15672',
      '-e',
      'RABBITMQ_DEFAULT_USER=larity',
      '-e',
      'RABBITMQ_DEFAULT_PASS=larity_dev',
      'rabbitmq:3-management-alpine',
    ];

    const result = execSync(cmd.join(' '));
    this.containerId = result.toString().trim();
    console.log(`Container started with ID: ${this.containerId}`);
  }

  async waitForReady(maxRetries = 60): Promise<void> {
    console.log('Waiting for RabbitMQ to be ready...');

    for (let i = 0; i < maxRetries; i++) {
      try {
        const conn = await amqp.connect(this.amqpUrl);
        await conn.close();
        console.log('RabbitMQ is ready!');
        return;
      } catch (_error) {
        if (i % 5 === 0) {
          console.log(`RabbitMQ not ready yet, retry ${i + 1}/${maxRetries}...`);
        }
        await sleep(1000);
      }
    }

    // If we failed, let's print the logs to see why
    if (this.containerId) {
      try {
        const logs = execSync(`docker logs ${this.containerId}`).toString();
        console.log('--- RabbitMQ Container Logs ---');
        console.log(logs);
        console.log('-------------------------------');
      } catch (_e) {
        console.error('Failed to fetch logs');
      }
    }

    throw new Error('RabbitMQ container failed to become ready');
  }

  async stop(): Promise<void> {
    console.log('Stopping RabbitMQ test container...');

    if (this.containerId) {
      try {
        execSync(`docker rm -f ${this.containerId}`);
        console.log('Container stopped and removed');
      } catch (error) {
        console.error('Failed to stop container:', error);
      }
      this.containerId = null;
    }
  }

  getUrl(): string {
    return this.amqpUrl;
  }
}

const testContainer = new RabbitMQTestContainer();

describe('RabbitMQ Integration Tests', () => {
  beforeAll(async () => {
    process.env.RABBITMQ_URL = testContainer.getUrl();

    try {
      await testContainer.start();
      await testContainer.waitForReady();

      // Initialize infrastructure (create queues/exchanges)
      await setupRabbitMQ();
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }, 120000);

  afterAll(async () => {
    await closeConnection();
    await testContainer.stop();
  }, 60000);

  describe('Publish and Consume', () => {
    it('should publish a message and consume it', async () => {
      const testQueue = Queues.MEETING_TRANSCRIBE;
      // We need to use the routing key bound to this queue.
      // In queues.ts: await ch.bindQueue(q, Exchanges.EVENTS, q.replace("q.", ""));
      // So for "q.meeting.transcribe", routing key is "meeting.transcribe"
      const routingKey = testQueue.replace('q.', '');

      const payload = {
        id: 'integration-test-id',
        data: 'hello world',
        timestamp: Date.now(),
      };

      let receivedData: unknown = null;
      let messageReceived = false;

      // Start consumer
      await consume(testQueue, (data) => {
        receivedData = data;
        messageReceived = true;
        return Promise.resolve();
      });

      // Publish message
      await publish(routingKey, payload);

      // Wait for message
      let retries = 0;
      while (!messageReceived && retries < 50) {
        await sleep(100);
        retries++;
      }

      expect(messageReceived).toBe(true);
      expect(receivedData).toEqual(payload);
    });

    it('should handle multiple messages', async () => {
      const testQueue = Queues.MEETING_SUMMARY;
      const routingKey = testQueue.replace('q.', '');

      const messages = [
        { id: 1, text: 'msg1' },
        { id: 2, text: 'msg2' },
        { id: 3, text: 'msg3' },
      ];

      const received: { id: number; text: string }[] = [];

      await consume(testQueue, (data) => {
        received.push(data as { id: number; text: string });
        return Promise.resolve();
      });

      for (const msg of messages) {
        await publish(routingKey, msg);
      }

      // Wait for all messages
      let retries = 0;
      while (received.length < 3 && retries < 50) {
        await sleep(100);
        retries++;
      }

      expect(received.length).toBe(3);
      const sortedReceived = received.sort((a, b) => a.id - b.id);
      expect(sortedReceived).toEqual(messages);
    });
  });
});
