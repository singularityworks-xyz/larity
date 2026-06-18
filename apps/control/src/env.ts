import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../../../");
const envPath = join(projectRoot, ".env");

config({ path: envPath });

// Environment variable validation
const requiredEnvVars = ["DATABASE_URL"] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:1420",
  "http://localhost:5173",
  "tauri://localhost",
  "http://tauri.localhost",
];

const configuredOrigins = [
  ...(process.env.FRONTEND_URLS?.split(",") ?? []),
  process.env.FRONTEND_URL ?? "",
]
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const FRONTEND_ORIGINS = [
  ...new Set([...configuredOrigins, ...DEFAULT_TRUSTED_ORIGINS]),
];

export const env = {
  PORT: process.env.PORT ?? "3000",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: process.env.DATABASE_URL as string,
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",
  FRONTEND_ORIGINS,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  LOG_LEVEL: process.env.LOG_LEVEL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  PERSONAL_EMAIL: process.env.PERSONAL_EMAIL,
};

// Log unused optionalEnvVars to satisfy linter or just remove it if it's purely for documentation
// For now, let's keep it and use it in validation if we want, but let's just make sure the env object has them.
