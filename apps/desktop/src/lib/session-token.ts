const SESSION_TOKEN_KEY = "larity.session-token";

/**
 * Session token shape: signed `id.signature` (base64url dot base64url).
 * Never log the token — it's bearer material.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeSessionToken(token: string): boolean {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isValidCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "larity:" &&
      parsed.host === "auth" &&
      parsed.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

export function parseCallbackToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    if (!(token && TOKEN_PATTERN.test(token))) {
      return null;
    }
    if (token.length < 32 || token.length > 512) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}
