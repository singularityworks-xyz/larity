/**
 * test-client.ts — WebSocket Test Client
 *
 * Simulates a client sending binary audio frames to the realtime plane.
 *
 * Usage:
 *   bun run apps/realtime/scripts/test-client.ts [sessionId] [frameCount] [intervalMs]
 *
 * Examples:
 *   bun run apps/realtime/scripts/test-client.ts
 *   bun run apps/realtime/scripts/test-client.ts my-session-123 100 50
 */

const sessionId = process.argv[2] || `test-session-${Date.now()}`;
const frameCount = parseInt(process.argv[3] || '20', 10);
const intervalMs = parseInt(process.argv[4] || '100', 10);

const wsUrl = `ws://localhost:9001/?sessionId=${sessionId}`;

console.log('========================================');
console.log('  Realtime Plane Test Client');
console.log('========================================');
console.log(`Session ID:    ${sessionId}`);
console.log(`Frame Count:   ${frameCount}`);
console.log(`Interval:      ${intervalMs}ms`);
console.log(`WebSocket URL: ${wsUrl}`);
console.log('----------------------------------------');

// Create a fake audio frame (random binary data simulating audio)
function createFakeAudioFrame(size: number = 1024): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < size; i++) {
    view[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

// Connect to WebSocket
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log('[client] Connected to realtime plane');
  console.log('[client] Starting to send audio frames...\n');

  let framesSent = 0;

  const sendFrame = () => {
    if (framesSent >= frameCount) {
      console.log(`\n[client] Finished sending ${frameCount} frames`);
      console.log('[client] Closing connection...');
      ws.close(1000, 'Test complete');
      return;
    }

    const frame = createFakeAudioFrame(1024);
    ws.send(frame);
    framesSent++;

    // Progress indicator
    if (framesSent % 10 === 0 || framesSent === frameCount) {
      console.log(`[client] Sent frame ${framesSent}/${frameCount}`);
    }

    setTimeout(sendFrame, intervalMs);
  };

  // Start sending frames
  sendFrame();
};

ws.onmessage = (event) => {
  console.log('[client] Received message from server:', event.data);
};

ws.onerror = (event) => {
  console.error('[client] WebSocket error:', event);
};

ws.onclose = (event) => {
  console.log(`[client] Connection closed (code: ${event.code}, reason: ${event.reason})`);
  console.log('========================================');
  process.exit(0);
};
