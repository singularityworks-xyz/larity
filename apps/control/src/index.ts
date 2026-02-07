import { env, validateEnv } from "./env";
import { app } from "./server";

validateEnv();

const PORT = env.PORT ?? "3000";

app.listen(PORT);

console.log(`🦊 Control plane running at http://localhost:${PORT}`);
console.log(`   Health: http://localhost:${PORT}/health`);
console.log(`   API:    http://localhost:${PORT}/api`);
