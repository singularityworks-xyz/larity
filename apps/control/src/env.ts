// Environment variable validation
const requiredEnvVars = ['DATABASE_URL'] as const;

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'BETTER_AUTH_SECRET',
] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const env = {
  PORT: process.env.PORT ?? '3000',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  DATABASE_URL: process.env.DATABASE_URL!,
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
};
