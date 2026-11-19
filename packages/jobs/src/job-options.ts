export function createCommonJobOptions(
  backoffDelayMs = Number(process.env.BACKOFF_DELAY_MS ?? "5000")
) {
  return {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: backoffDelayMs,
    },
  };
}
