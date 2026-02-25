import { createRealtimeLogger } from "../logger";

const log = createRealtimeLogger("validate-session");

// URL for validating sessions with control plane
const CONTROL_API_URL = process.env.CONTROL_API_URL || "http://localhost:3000";

interface ValidationResponse {
  success: boolean;
  data?: {
    valid: boolean;
  };
}

/**
 * Validate session with control plane
 *
 * Makes an HTTP call to verify the session exists and the user is authorized
 */
export async function validateSession(
  sessionId: string,
  userId?: string,
  role?: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${CONTROL_API_URL}/meeting-session/${sessionId}/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, role }),
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as unknown;
    if (
      data &&
      typeof data === "object" &&
      "success" in data &&
      (data as ValidationResponse).success
    ) {
      const validationData = data as ValidationResponse;
      return validationData.success && validationData.data?.valid === true;
    }
  } catch (error) {
    log.error({ err: error, sessionId }, "Session validation failed");
    // CRITICAL: Fail closed. Do not allow access if validation fails.
    return false;
  }
  return false;
}
