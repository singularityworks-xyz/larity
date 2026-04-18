/**
 * test-client.ts — Realtime Integration Test Client
 *
 * Simulates a host sending linear16 PCM frames to the realtime plane.
 *
 * Integration path exercised:
 * host WebSocket -> realtime worker -> in-process Deepgram WS -> Redis transcript channel
 *
 * Usage:
 *   bun run apps/realtime/scripts/test-client.ts [sessionId] [frameCount] [intervalMs] [toneHz]
 *
 * Examples:
 *   bun run apps/realtime/scripts/test-client.ts
 *   bun run apps/realtime/scripts/test-client.ts my-session-123 120 50 440
 */

import Redis from "ioredis";

const sessionId = process.argv[2] || `test-session-${Date.now()}`;
const frameCount = Number.parseInt(process.argv[3] || "20", 10);
const intervalMs = Number.parseInt(process.argv[4] || "100", 10);
const toneHz = Number.parseInt(process.argv[5] || "440", 10);
const userId = "test-user-123";
const role = "host";

const wsUrl = `ws://localhost:9001/?sessionId=${sessionId}&userId=${userId}&role=${role}`;
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const transcriptChannel = `meeting.stt.${sessionId}`;

console.log("========================================");
console.log("  Realtime Integration Test Client");
console.log("========================================");
console.log(`Session ID:          ${sessionId}`);
console.log(`Frame Count:         ${frameCount}`);
console.log(`Interval:            ${intervalMs}ms`);
console.log(`Tone:                ${toneHz}Hz`);
console.log(`WebSocket URL:       ${wsUrl}`);
console.log(`Transcript Channel:  ${transcriptChannel}`);
console.log("----------------------------------------");

const SAMPLE_RATE = 16_000;
const FRAME_MS = 50;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const FRAME_BYTES = FRAME_SAMPLES * 2;

let sampleCursor = 0;

function createToneFramePcm16(): Uint8Array {
  const bytes = new Uint8Array(FRAME_BYTES);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < FRAME_SAMPLES; i++) {
    const t = sampleCursor / SAMPLE_RATE;
    const sample = Math.sin(2 * Math.PI * toneHz * t);
    const value = Math.round(sample * 0.3 * 32_767);
    view.setInt16(i * 2, value, true);
    sampleCursor += 1;
  }

  return bytes;
}

const ws = new WebSocket(wsUrl);
const redisSubscriber = new Redis(redisUrl);

let sawTranscript = false;

redisSubscriber.subscribe(transcriptChannel).then(() => {
  console.log(`[client] Listening for transcripts on ${transcriptChannel}`);
});

redisSubscriber.on("message", (channel, message) => {
  if (channel !== transcriptChannel) {
    return;
  }

  sawTranscript = true;

  try {
    const payload = JSON.parse(message) as {
      transcript: string;
      diarizationIndex: number;
      confidence: number;
      isFinal: boolean;
    };

    console.log(
      `[client] Transcript (${payload.isFinal ? "final" : "partial"}) diarization=${payload.diarizationIndex} confidence=${payload.confidence.toFixed(2)} :: ${payload.transcript}`
    );
  } catch {
    console.log("[client] Transcript payload:", message);
  }
});

ws.onopen = () => {
  console.log("[client] Connected to realtime plane");
  console.log("[client] Starting to send PCM frames...\n");

  let framesSent = 0;

  const sendFrame = () => {
    if (framesSent >= frameCount) {
      clearInterval(vadInterval);
      console.log(`\n[client] Finished sending ${frameCount} frames`);
      console.log("[client] Closing connection...");
      ws.close(1000, "Test complete");
      return;
    }

    const frame = createToneFramePcm16();
    ws.send(frame);
    framesSent += 1;

    if (framesSent % 10 === 0 || framesSent === frameCount) {
      console.log(`[client] Sent frame ${framesSent}/${frameCount}`);
    }

    setTimeout(sendFrame, intervalMs);
  };

  sendFrame();

  const vadInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const type = Math.random() > 0.5 ? "vad_speaking" : "vad_silence";
      ws.send(
        JSON.stringify({
          type,
          userId,
          sessionId,
          clientSendTs: Date.now(),
        })
      );
      console.log(`[client] Sent VAD signal: ${type}`);
    }
  }, 5000);
};

ws.onmessage = (event) => {
  console.log("[client] Received message from server:", event.data);
};

ws.onerror = (event) => {
  console.error("[client] WebSocket error:", event);
};

ws.onclose = (event) => {
  console.log(
    `[client] Connection closed (code: ${event.code}, reason: ${event.reason})`
  );

  setTimeout(() => {
    if (!sawTranscript) {
      console.log(
        "[client] No transcript observed yet. Ensure DEEPGRAM_API_KEY is set and realtime service is running."
      );
    }

    redisSubscriber.quit().finally(() => {
      console.log("========================================");
      process.exit(0);
    });
  }, 2000);
};
