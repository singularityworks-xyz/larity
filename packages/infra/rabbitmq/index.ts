export * from './connection';
export * from './consume';
export * from './publish';
export * from './types';
export * from './queues';
export * from './exchanges';

import { setupExchanges } from './exchanges';
import { setupQueues } from './queues';

export async function setupRabbitMQ() {
    await setupExchanges();
    await setupQueues();
    console.log('[RabbitMQ] Infrastructure configured successfully');
}
