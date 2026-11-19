import Redis from "ioredis";

const sessionId = process.argv[2];
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

console.log("========================================");
console.log("  Redis Subscription Monitor");
console.log("========================================");
console.log(`Redis URL: ${redisUrl}`);
console.log(`Session Filter: ${sessionId || "ALL"}`);
console.log("----------------------------------------\n");

const subscriber = new Redis(redisUrl);

let frameCount = 0;
let sessionStartCount = 0;
let sessionEndCount = 0;
const startTime = Date.now();

const channels: string[] = ["realtime.session.start", "realtime.session.end"];

if (sessionId) {
  channels.push(`realtime.audio.${sessionId}`);
  subscriber.subscribe(...channels).then(() => {
    console.log("[subscriber] Subscribed to channels:");
    for (const ch of channels) {
      console.log(`  - ${ch}`);
    }
    console.log("");
  });
} else {
  subscriber
    .subscribe("realtime.session.start", "realtime.session.end")
    .then(() => {
      console.log("[subscriber] Subscribed to session lifecycle events");
    });

  subscriber.psubscribe("realtime.audio.*").then(() => {
    console.log("[subscriber] Pattern subscribed to realtime.audio.*");
    console.log("");
  });
}

subscriber.on("message", (channel: string, message: string) => {
  const data = JSON.parse(message);

  if (channel === "realtime.session.start") {
    sessionStartCount++;
    console.log(
      `[SESSION START] ${data.sessionId} at ${new Date(data.ts).toISOString()}`
    );
  } else if (channel === "realtime.session.end") {
    sessionEndCount++;
    console.log(
      `[SESSION END] ${data.sessionId} duration=${data.duration}ms at ${new Date(data.ts).toISOString()}`
    );
  } else if (channel.startsWith("realtime.audio.")) {
    frameCount++;
    const frameSize = data.frame ? Buffer.from(data.frame, "base64").length : 0;
    if (frameCount % 10 === 0 || frameCount <= 5) {
      console.log(
        `[AUDIO FRAME] session=${data.sessionId} size=${frameSize}B ts=${data.ts} (total: ${frameCount})`
      );
    }
  }
});

subscriber.on(
  "pmessage",
  (_pattern: string, channel: string, message: string) => {
    const data = JSON.parse(message);

    if (channel.startsWith("realtime.audio.")) {
      frameCount++;
      const frameSize = data.frame
        ? Buffer.from(data.frame, "base64").length
        : 0;
      if (frameCount % 10 === 0 || frameCount <= 5) {
        console.log(
          `[AUDIO FRAME] session=${data.sessionId} size=${frameSize}B ts=${data.ts} (total: ${frameCount})`
        );
      }
    }
  }
);

subscriber.on("error", (err) => {
  console.error("[subscriber] Redis error:", err);
});

function shutdown() {
  const duration = (Date.now() - startTime) / 1000;
  console.log("\n========================================");
  console.log("  Session Statistics");
  console.log("========================================");
  console.log(`Duration:        ${duration.toFixed(1)}s`);
  console.log(`Sessions Start:  ${sessionStartCount}`);
  console.log(`Sessions End:    ${sessionEndCount}`);
  console.log(`Audio Frames:    ${frameCount}`);
  console.log(`Frames/sec:      ${(frameCount / duration).toFixed(1)}`);
  console.log("========================================");

  subscriber.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[subscriber] Listening for messages... (Ctrl+C to stop)\n");
