/**
 * index.ts — STT Library Exports
 *
 * This package is imported by apps/realtime so the realtime worker owns
 * both the client WebSocket and the Deepgram WebSocket in one process.
 */

// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./channels";
export * from "./env";
export * from "./session-manager";
export * from "./types";
