import { createInfraLogger } from "../logger";
import { getChannel } from "./connection";

const log = createInfraLogger("rabbitmq-consume");

export async function consume<T>(
  queue: string,
  handler: (data: T) => Promise<void>
) {
  const ch = await getChannel();

  log.info({ queue }, "Consumer starting");

  await ch.consume(queue, async (msg) => {
    if (!msg) {
      log.warn({ queue }, "Consumer cancelled by server");
      return;
    }

    try {
      const content = msg.content.toString();
      let data: T;

      try {
        data = JSON.parse(content) as T;
      } catch (parseError) {
        log.error({ err: parseError, queue }, "JSON Parse Error");
        // Cannot parse -> DLQ immediately
        ch.nack(msg, false, false);
        return;
      }

      await handler(data);
      ch.ack(msg);
    } catch (error) {
      log.error({ err: error, queue }, "Processing Error");
      // Handler failed -> DLQ
      ch.nack(msg, false, false);
    }
  });
}
