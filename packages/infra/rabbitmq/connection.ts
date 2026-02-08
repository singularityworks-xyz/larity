import type { ChannelModel, ConfirmChannel } from "amqplib";
import amqp from "amqplib";
import { createInfraLogger } from "../logger";

const log = createInfraLogger("rabbitmq-connection");

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://larity:larity_dev@localhost:5672";

export async function getChannel(): Promise<ConfirmChannel> {
  if (channel) {
    return channel;
  }

  try {
    if (!connection) {
      log.info(
        { host: RABBITMQ_URL.split("@")[1] || "localhost" },
        "Connecting to RabbitMQ"
      );
      connection = await amqp.connect(RABBITMQ_URL);

      connection.on("error", (err: unknown) => {
        log.error({ err }, "RabbitMQ connection error");
        resetConnection();
      });

      connection.on("close", () => {
        log.warn("RabbitMQ connection closed");
        resetConnection();
      });
    }

    if (!connection) {
      throw new Error("Failed to establish connection");
    }

    channel = await connection.createConfirmChannel();

    if (!channel) {
      throw new Error("Failed to create channel");
    }

    channel.on("error", (err: unknown) => {
      log.error({ err }, "RabbitMQ channel error");
      channel = null;
    });

    channel.on("close", () => {
      log.warn("RabbitMQ channel closed");
      channel = null;
    });

    await channel.prefetch(
      process.env.RABBITMQ_PREFETCH
        ? Number.parseInt(process.env.RABBITMQ_PREFETCH, 10)
        : 10
    );

    return channel;
  } catch (error) {
    log.error({ err: error }, "Failed to connect to RabbitMQ");
    resetConnection();
    throw error;
  }
}

function resetConnection() {
  try {
    if (channel) {
      channel.close().catch(() => {
        // ignore
      });
    }
    if (connection) {
      connection.close().catch(() => {
        // ignore
      });
    }
  } catch (_e) {
    // Ignore errors
  }
  connection = null;
  channel = null;
}

export async function closeConnection() {
  await resetConnection();
}
