import { createRealtimeLogger } from "../logger";
import { AudioStreamer } from "./streamer";

const log = createRealtimeLogger("audio-registry");

const streamers = new Map<string, AudioStreamer>();

export function getStreamer(sessionId: string): AudioStreamer | undefined {
  return streamers.get(sessionId);
}

export function createStreamer(
  sessionId: string,
  orgId: string
): AudioStreamer {
  const existing = streamers.get(sessionId);
  if (existing && !existing.done) {
    log.warn({ sessionId }, "AudioStreamer already exists for session");
    return existing;
  }

  const streamer = new AudioStreamer(orgId, sessionId);
  streamers.set(sessionId, streamer);

  log.info({ sessionId, orgId }, "AudioStreamer registered");

  return streamer;
}

export async function closeStreamer(sessionId: string): Promise<void> {
  const streamer = streamers.get(sessionId);
  if (!streamer) {
    return;
  }

  try {
    await streamer.end();
  } catch (error) {
    log.error({ err: error, sessionId }, "Error closing AudioStreamer");
  } finally {
    streamers.delete(sessionId);
    log.info({ sessionId }, "AudioStreamer removed from registry");
  }
}

export function getAllStreamerIds(): string[] {
  return Array.from(streamers.keys());
}
