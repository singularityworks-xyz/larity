import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  const { config } = await import("dotenv");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  config({ path: path.resolve(__dirname, "../../.env") });
  config({ path: path.resolve(__dirname, "../../.env.development") });
} catch {
  // In production, environment variables are already injected
}

import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
