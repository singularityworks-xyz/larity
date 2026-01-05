import { getChannel } from './connection';

export async function consume<T> (
    queue: string,
    handler: (data: T) => Promise<void>
) {
    const ch = await getChannel();

await ch.consume(queue, async(msg) => {
    if (!msg) return;

    try {
        const data = JSON.parse(msg.content.toString()) as T;

        await handler(data);

        ch.ack(msg);
    } catch (error) {
        console.error(error);
        ch.nack(msg, false, false);
    }
})}