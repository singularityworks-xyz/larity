import { getChannel } from './connection';
import { Exchanges } from './exchanges';

export async function publish<T> (
    routingKey: string,
    payload: T
) {
    const ch = await getChannel();

    const buffer = Buffer.from(JSON.stringify(payload));

    ch.publish(
        Exchanges.EVENTS,
        routingKey,
        buffer,
        {
            persistent: true,
            contentType: "application/json",
        }
    );

    await ch.waitForConfirms();
}