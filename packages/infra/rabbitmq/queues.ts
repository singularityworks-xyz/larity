import { getChannel } from "./connection";
import { Exchanges } from "./exchanges";

export const Queues = {
  MEETING_TRANSCRIBE: "q.meeting.transcribe",
  MEETING_SUMMARY: "q.meeting.summary",
} as const;

export async function setupQueues() {
  const ch = await getChannel();

  await ch.assertExchange("ex.dlx", "topic", { durable: true });

  for (const q of Object.values(Queues)) {
    const dlq = `${q}.dlq`;

    await ch.assertQueue(dlq, { durable: true });

    await ch.assertQueue(q, {
      durable: true,
      deadLetterExchange: "ex.dlx",
      deadLetterRoutingKey: q,
    });

    await ch.bindQueue(q, "ex.dlx", q);
    await ch.bindQueue(q, Exchanges.EVENTS, q.replace("q.", ""));
  }
}
