import { setupTelemetry } from "@larity/telemetry";

// Initialize telemetry
setupTelemetry("workers");

console.log("Hello via Bun workers!");
