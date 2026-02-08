// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./connection";
export * from "./consume";
export * from "./exchanges";
export * from "./publish";
export * from "./queues";
export * from "./types";

import { createInfraLogger } from "../logger";
import { setupExchanges } from "./exchanges";
import { setupQueues } from "./queues";

const log = createInfraLogger("rabbitmq-setup");

export async function setupRabbitMQ() {
  await setupExchanges();
  await setupQueues();
  log.info("Infrastructure configured successfully");
}
