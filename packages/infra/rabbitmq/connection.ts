import amqp from 'amqplib';
import type { ConfirmChannel } from 'amqplib';

let connection: any = null;
let channel: ConfirmChannel | null = null;

export async function getChannel(): Promise<ConfirmChannel> {
    if (channel) return channel;

    // connection = await amqp.connect(process.env.RABBITMQ_URL!);
    connection = await amqp.connect("amqp://larity:larity_dev@localhost:5672");

    if (!connection) {
        throw new Error('Failed to connect to RabbitMQ');
    }

    channel = await connection.createConfirmChannel();

    if (!channel) {
        throw new Error('Failed to create channel');
    }

    await channel.prefetch(5);

    return channel;
}