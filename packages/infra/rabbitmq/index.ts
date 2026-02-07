// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./connection";
export * from "./consume";
export * from "./exchanges";
export * from "./publish";
export * from "./queues";
export * from "./types";

import { setupExchanges } from "./exchanges";
import { setupQueues } from "./queues";

export async function setupRabbitMQ() {
  await setupExchanges();
  await setupQueues();
  console.log("[RabbitMQ] Infrastructure configured successfully");
}
