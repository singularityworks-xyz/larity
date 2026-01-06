import { getChannel } from './connection';
import { Exchanges } from './exchanges';

export async function publish<T>(
  routingKey: string,
  payload: T,
  exchange: string = Exchanges.EVENTS
) {
  const ch = await getChannel();

  const buffer = Buffer.from(JSON.stringify(payload));

  const published = ch.publish(exchange, routingKey, buffer, {
    persistent: true,
    contentType: 'application/json',
    timestamp: Date.now(),
  });

  if (!published) {
    console.warn(`[RabbitMQ] Channel buffer full for ${routingKey}`);
  }

  await ch.waitForConfirms();
}
