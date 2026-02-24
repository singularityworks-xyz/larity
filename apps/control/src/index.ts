import { setupTelemetry } from "@larity/telemetry";

// Initialize telemetry before other imports
setupTelemetry("control");

import { env, validateEnv } from "./env";
import { rootLogger } from "./logger";
import { app } from "./server";

validateEnv();

const PORT = env.PORT ?? "3000";

app.listen(PORT);

rootLogger.info({ port: PORT }, "Control plane running");
