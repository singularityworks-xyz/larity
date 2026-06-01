/**
 * index.ts — STT Library Exports
 *
 * This package is imported by apps/realtime so the realtime worker owns
 * both the client WebSocket and the Deepgram WebSocket in one process.
 */

// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./channels";
export * from "./deepgram/batch";
export * from "./dual-channel-session";
export * from "./env";
export { SessionManager, sessionManager } from "./session-manager";
export * from "./types";
