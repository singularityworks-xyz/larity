const connectionCount = Number.parseInt(process.argv[2] || "10", 10);
const framesPerSecond = Number.parseInt(process.argv[3] || "20", 10);
const durationSeconds = Number.parseInt(process.argv[4] || "10", 10);

const wsUrl = "ws://localhost:9001";
const frameIntervalMs = 1000 / framesPerSecond;

console.log("========================================");
console.log("  Realtime Plane Stress Test");
console.log("========================================");
console.log(`Connections:     ${connectionCount}`);
console.log(`Frames/sec:      ${framesPerSecond} per connection`);
console.log(`Duration:        ${durationSeconds}s`);
console.log(
  `Total frames:    ~${connectionCount * framesPerSecond * durationSeconds}`
);
console.log("----------------------------------------\n");

const stats = {
  connected: 0,
  disconnected: 0,
  errors: 0,
  framesSent: 0,
  framesPerConnection: new Map<string, number>(),
};

function createFakeAudioFrame(size = 512): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < size; i++) {
    view[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

function createConnection(id: number): Promise<void> {
  return new Promise((resolve) => {
    const sessionId = `stress-test-${id}-${Date.now()}`;
    const url = `${wsUrl}/?sessionId=${sessionId}`;
    const ws = new WebSocket(url);
    let intervalId: ReturnType<typeof setInterval>;
    let localFrameCount = 0;

    ws.onopen = () => {
      stats.connected++;
      console.log(
        `[conn-${id}] Connected (${stats.connected}/${connectionCount})`
      );

      intervalId = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const frame = createFakeAudioFrame();
          ws.send(frame);
          localFrameCount++;
          stats.framesSent++;
        }
      }, frameIntervalMs);
    };

    ws.onerror = () => {
      stats.errors++;
    };

    ws.onclose = () => {
      stats.disconnected++;
      stats.framesPerConnection.set(sessionId, localFrameCount);
      if (intervalId) {
        clearInterval(intervalId);
      }
      resolve();
    };

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Test complete");
      }
    }, durationSeconds * 1000);
  });
}

const progressInterval = setInterval(() => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log(
    `[progress] ${elapsed}s - Connected: ${stats.connected}, Frames: ${stats.framesSent}, Errors: ${stats.errors}`
  );
}, 2000);

const startTime = Date.now();
console.log("[stress] Starting connections...\n");

const connectionPromises: Promise<void>[] = [];
for (let i = 0; i < connectionCount; i++) {
  await new Promise((r) => setTimeout(r, 50));
  connectionPromises.push(createConnection(i));
}

Promise.all(connectionPromises).then(() => {
  clearInterval(progressInterval);

  const totalDuration = (Date.now() - startTime) / 1000;
  const avgFramesPerConnection = stats.framesSent / connectionCount;
  const framesPerSecActual = stats.framesSent / totalDuration;

  console.log("\n========================================");
  console.log("  Stress Test Results");
  console.log("========================================");
  console.log(`Duration:          ${totalDuration.toFixed(1)}s`);
  console.log(`Peak Connections:  ${stats.connected}`);
  console.log(`Total Frames:      ${stats.framesSent}`);
  console.log(`Avg Frames/Conn:   ${avgFramesPerConnection.toFixed(1)}`);
  console.log(`Actual Frames/sec: ${framesPerSecActual.toFixed(1)}`);
  console.log(`Errors:            ${stats.errors}`);
  console.log("========================================");

  process.exit(0);
});
