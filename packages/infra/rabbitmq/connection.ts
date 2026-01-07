import type { ChannelModel, ConfirmChannel } from 'amqplib';
import amqp from 'amqplib';

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://larity:larity_dev@localhost:5672';

export async function getChannel(): Promise<ConfirmChannel> {
  if (channel) return channel;

  try {
    if (!connection) {
      console.log('Connecting to RabbitMQ at', RABBITMQ_URL.split('@')[1] || 'localhost');
      connection = await amqp.connect(RABBITMQ_URL);

      connection.on('error', (err: unknown) => {
        console.error('RabbitMQ connection error:', err);
        resetConnection();
      });

      connection.on('close', () => {
        console.warn('RabbitMQ connection closed');
        resetConnection();
      });
    }

    if (!connection) {
      throw new Error('Failed to establish connection');
    }

    channel = await connection.createConfirmChannel();

    if (!channel) {
      throw new Error('Failed to create channel');
    }

    channel.on('error', (err: unknown) => {
      console.error('RabbitMQ channel error:', err);
      channel = null;
    });

    channel.on('close', () => {
      console.warn('RabbitMQ channel closed');
      channel = null;
    });

    await channel.prefetch(
      process.env.RABBITMQ_PREFETCH ? parseInt(process.env.RABBITMQ_PREFETCH, 10) : 10
    );

    return channel;
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    resetConnection();
    throw error;
  }
}

function resetConnection() {
  try {
    if (channel) channel.close().catch(() => {});
    if (connection) connection.close().catch(() => {});
  } catch (_e) {
    // Ignore errors
  }
  connection = null;
  channel = null;
}

export async function closeConnection() {
  await resetConnection();
}
