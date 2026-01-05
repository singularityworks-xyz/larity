import { getChannel } from './connection';

export const Exhcanges = {
    EVENTS: "ex.events",
    JOBS: "ex.jobs"
} as const;

export async function setupExchanges(){
    const ch = await getChannel();
    await ch.assertExchange(Exhcanges.EVENTS, "topic", { durable: true });
    await ch.assertExchange(Exhcanges.JOBS, "topic", { durable: true });
}