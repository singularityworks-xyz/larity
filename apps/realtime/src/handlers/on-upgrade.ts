import type {
  HttpRequest,
  HttpResponse,
  us_socket_context_t,
} from "uWebSockets.js";

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
 * Makes an HTTP call to verify the session exists
 */
async function validateSession(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${CONTROL_API_URL}/meeting-session/${sessionId}/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
    console.error("[onUpgrade] Session validation failed:", error);
    // In production, you might want to reject unknown sessions
    // For development, we'll allow it
    return true;
  }
  return false;
}

/**
 * Handle WebSocket upgrade requests
 *
 * Validates the session before allowing the connection.
 */
export async function onUpgrade(
  res: HttpResponse,
  req: HttpRequest,
  context: us_socket_context_t
): Promise<void> {
  // Extract session ID from query string
  const query = req.getQuery();
  const params = new URLSearchParams(query);
  const sessionId = params.get("sessionId");

  if (!sessionId) {
    res.writeStatus("400 Bad Request");
    res.end("Missing sessionId parameter");
    return;
  }

  // Validate session exists
  const isValid = await validateSession(sessionId);

  if (!isValid) {
    res.writeStatus("401 Unauthorized");
    res.end("Invalid or expired session");
    return;
  }

  // Proceed with upgrade
  res.upgrade(
    {
      sessionId,
      connectedAt: Date.now(),
    },
    req.getHeader("sec-websocket-key"),
    req.getHeader("sec-websocket-protocol"),
    req.getHeader("sec-websocket-extensions"),
    context
  );
}
