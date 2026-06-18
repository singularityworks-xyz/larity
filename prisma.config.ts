import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Load dotenv dynamically in development
try {
  const { config } = await import("dotenv");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  config({ path: path.resolve(__dirname, ".env") });
  config({ path: path.resolve(__dirname, ".env.development") });
} catch {
  // In production, environment variables are already injected
}

export default defineConfig({
  schema: "./packages/infra/prisma/schema.prisma",
  migrations: {
    path: "./packages/infra/prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
