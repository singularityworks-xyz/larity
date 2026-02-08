import { createInfraLogger } from "../logger";
import { getChannel } from "./connection";
import { Exchanges } from "./exchanges";

const log = createInfraLogger("rabbitmq-publish");

export async function publish<T>(
  routingKey: string,
  payload: T,
  exchange: string = Exchanges.EVENTS
) {
  const ch = await getChannel();

  const buffer = Buffer.from(JSON.stringify(payload));

  const published = ch.publish(exchange, routingKey, buffer, {
    persistent: true,
    contentType: "application/json",
    timestamp: Date.now(),
  });

  if (!published) {
    log.warn({ routingKey, exchange }, "Channel buffer full");
  }

  await ch.waitForConfirms();
}
