/**
 * scripts/latency.ts — repeatable live-path latency measurement harness.
 *
 * Streams deterministic synthetic PCM (or a raw s16le 16kHz mono `--pcm-file`)
 * to the realtime WebSocket as tagged dual-channel frames, counts inbound
 * message types, and prints the `/admin/metrics` snapshot before/after.
 *
 * Usage:
 *   bun scripts/latency.ts [--duration=30] [--url=ws://127.0.0.1:9001]
 *     [--session=test-session-latency] [--pcm-file=/path/to/audio.s16le]
 *
 * Notes:
 * - The default session id contains "test-session", which the realtime dev
 *   validator accepts without the control plane.
 * - Synthetic sine audio exercises frame flow + drop counters. Meaningful
 *   `stt.audio_end_to_final_ms` values need a Deepgram key server-side and
 *   speech-like input (pass a real capture via --pcm-file).
 */

const SAMPLE_RATE = 16_000;
const SAMPLES_PER_FRAME = 512;
const PCM_BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2;
const TICK_MS = 32;
const TAG_MIC = 0;
const TAG_SYS = 1;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface LatencyArgs {
  durationSec: number;
  pcmFile?: string;
  sessionId: string;
  url: string;
}

function parseArgs(argv: string[]): LatencyArgs {
  const args: LatencyArgs = {
    durationSec: 180,
    sessionId: "test-session-latency",
    url: "ws://127.0.0.1:9001",
  };
  for (const raw of argv) {
    const [key, value] = raw.split("=");
    if (key === "--duration" && value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.durationSec = parsed;
      }
    } else if (key === "--url" && value) {
      args.url = value;
    } else if (key === "--session" && value) {
      args.sessionId = value;
    } else if (key === "--pcm-file" && value) {
      args.pcmFile = value;
    }
  }
  return args;
}

function wsUrlToHttpBase(wsUrl: string): string {
  if (wsUrl.startsWith("wss://")) {
    return `https://${wsUrl.slice("wss://".length)}`;
  }
  return `http://${wsUrl.slice("ws://".length)}`;
}

function buildSocketUrl(
  base: string,
  sessionId: string,
  userId: string
): string {
  const url = new URL(base);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("role", "host");
  return url.toString();
}

import { readFile } from "node:fs/promises";

/** Deterministic speech-like sample: gated syllabic-AM tone, no randomness. */
function synthSample(globalIndex: number, freqHz: number): number {
  const t = globalIndex / SAMPLE_RATE;
  const gate = t % 3 < 2 ? 1 : 0.05;
  const syllabic = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
  const tone = Math.sin(2 * Math.PI * freqHz * t);
  const value = tone * syllabic * gate * 9000;
  return Math.max(-32_768, Math.min(32_767, Math.round(value)));
}

function synthFrame(globalIndex: number, freqHz: number): Uint8Array {
  const frame = new Uint8Array(1 + PCM_BYTES_PER_FRAME);
  frame[0] = 0;
  const view = new DataView(frame.buffer);
  for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
    view.setInt16(1 + i * 2, synthSample(globalIndex + i, freqHz), true);
  }
  return frame;
}

function taggedFrame(pcm: Uint8Array, tag: number): Uint8Array {
  const frame = new Uint8Array(1 + pcm.length);
  frame[0] = tag;
  frame.set(pcm, 1);
  return frame;
}

async function loadPcmFile(path: string): Promise<Uint8Array> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch {
    throw new Error(`PCM file not found: ${path}`);
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; p50: number; p95: number }>;
}

async function fetchMetrics(httpBase: string): Promise<MetricsSnapshot | null> {
  try {
    const headers: Record<string, string> = {};
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey) {
      headers.authorization = `Bearer ${adminKey}`;
    }
    const res = await fetch(`${httpBase}/admin/metrics`, { headers });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as MetricsSnapshot;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const userId = "latency-harness";
  const httpBase = wsUrlToHttpBase(args.url);

  const pcmFile = args.pcmFile ? await loadPcmFile(args.pcmFile) : null;
  if (pcmFile && pcmFile.length < PCM_BYTES_PER_FRAME) {
    throw new Error(
      `PCM file too small: need at least ${PCM_BYTES_PER_FRAME} bytes`
    );
  }

  const before = await fetchMetrics(httpBase);

  const ws = new WebSocket(buildSocketUrl(args.url, args.sessionId, userId));
  ws.binaryType = "arraybuffer";

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () =>
      reject(new Error(`WebSocket connect failed: ${args.url}`));
  });

  const receivedByType = new Map<string, number>();
  ws.onmessage = (event) => {
    if (typeof event.data !== "string") {
      receivedByType.set("binary", (receivedByType.get("binary") ?? 0) + 1);
      return;
    }
    try {
      const data = JSON.parse(event.data) as {
        type?: string;
        utteranceId?: string;
      };
      let kind = "unknown";
      if (typeof data.type === "string") {
        kind = data.type;
      } else if (typeof data.utteranceId === "string") {
        kind = "utterance";
      }
      receivedByType.set(kind, (receivedByType.get(kind) ?? 0) + 1);
    } catch {
      receivedByType.set(
        "unparseable",
        (receivedByType.get("unparseable") ?? 0) + 1
      );
    }
  };

  const now = Date.now();
  ws.send(
    JSON.stringify({
      clientSendTs: now,
      clientTs: now,
      sessionId: args.sessionId,
      type: "audio_stream_start",
      userId,
    })
  );

  const totalTicks = Math.floor((args.durationSec * 1000) / TICK_MS);
  const startPerf = performance.now();
  let framesSent = 0;
  let fileOffset = 0;

  for (let tick = 0; tick < totalTicks; tick++) {
    let mic: Uint8Array;
    let sys: Uint8Array;
    if (pcmFile) {
      // Both channels carry the same slice: each Deepgram connection must
      // see a continuous stream. (Interleaving disjoint slices — as an
      // earlier revision did — halves each channel's audio rate and its
      // silence gaps, corrupting endpointing timing.)
      const chunk = pcmFile.slice(fileOffset, fileOffset + PCM_BYTES_PER_FRAME);
      fileOffset = (fileOffset + PCM_BYTES_PER_FRAME) % pcmFile.length;
      mic = taggedFrame(chunk, TAG_MIC);
      sys = taggedFrame(chunk, TAG_SYS);
    } else {
      const base = tick * SAMPLES_PER_FRAME;
      mic = synthFrame(base, 440);
      mic[0] = TAG_MIC;
      sys = synthFrame(base, 550);
      sys[0] = TAG_SYS;
    }
    ws.send(mic);
    ws.send(sys);
    framesSent += 2;

    const target = startPerf + (tick + 1) * TICK_MS;
    const wait = target - performance.now();
    if (wait > 0) {
      await sleep(wait);
    }
  }

  // Grace period: let endpointing + accumulator flush + pipeline finish.
  await sleep(5000);
  const after = await fetchMetrics(httpBase);
  ws.close();

  const summary = {
    after,
    before,
    durationSec: args.durationSec,
    framesSent,
    receivedByType: Object.fromEntries(receivedByType),
    sessionId: args.sessionId,
    url: args.url,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
