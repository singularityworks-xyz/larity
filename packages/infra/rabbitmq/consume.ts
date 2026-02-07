import { getChannel } from "./connection";

export async function consume<T>(
  queue: string,
  handler: (data: T) => Promise<void>
) {
  const ch = await getChannel();

  console.log(`[RabbitMQ] Consumer starting for queue: ${queue}`);

  await ch.consume(queue, async (msg) => {
    if (!msg) {
      console.warn(
        `[RabbitMQ] Consumer cancelled by server for queue: ${queue}`
      );
      return;
    }

    try {
      const content = msg.content.toString();
      let data: T;

      try {
        data = JSON.parse(content) as T;
      } catch (parseError) {
        console.error(`[RabbitMQ] JSON Parse Error in ${queue}:`, parseError);
        // Cannot parse -> DLQ immediately
        ch.nack(msg, false, false);
        return;
      }

      await handler(data);
      ch.ack(msg);
    } catch (error) {
      console.error(`[RabbitMQ] Processing Error in ${queue}:`, error);
      // Handler failed -> DLQ
      ch.nack(msg, false, false);
    }
  });
}
