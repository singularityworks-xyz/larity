function resolveEnv(
  name: string,
  value: string | undefined,
  devFallback: string
): string {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (import.meta.env.PROD) {
    throw new Error(
      `${name} is required for production builds. Set it in CI secrets or .env.production.`
    );
  }
  return devFallback;
}

export const CONTROL_URL = resolveEnv(
  "VITE_CONTROL_URL",
  import.meta.env.VITE_CONTROL_URL,
  "http://localhost:3000"
);

export const WS_URL = resolveEnv(
  "VITE_WS_URL",
  import.meta.env.VITE_WS_URL,
  "ws://127.0.0.1:9001"
);
