import { getChannel } from './connection';

export const Exchanges = {
    EVENTS: "ex.events",
    JOBS: "ex.jobs"
} as const;

export async function setupExchanges(){
    const ch = await getChannel();
    await ch.assertExchange(Exchanges.EVENTS, "topic", { durable: true });
    await ch.assertExchange(Exchanges.JOBS, "topic", { durable: true });
}