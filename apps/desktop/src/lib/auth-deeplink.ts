import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

import {
  clearStoredSessionToken,
  isValidCallbackUrl,
  parseCallbackToken,
  storeSessionToken,
} from "./session-token";

const OAUTH_PENDING_KEY = "larity.oauth-pending";
const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

let initialized = false;

export function markOAuthPending(): void {
  try {
    sessionStorage.setItem(
      OAUTH_PENDING_KEY,
      String(Date.now() + OAUTH_PENDING_TTL_MS)
    );
  } catch {
    // ignore
  }
}

function consumeOAuthPending(): boolean {
  try {
    const raw = sessionStorage.getItem(OAUTH_PENDING_KEY);
    if (!raw) {
      return false;
    }
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    const expiry = Number(raw);
    if (Number.isNaN(expiry) || Date.now() > expiry) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function prepareOAuthDeepLink(): void {
  markOAuthPending();
}

export function initAuthDeepLink(): void {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  onOpenUrl((urls) => {
    const callbackUrl = urls.find((u) => isValidCallbackUrl(u));
    if (!callbackUrl) {
      return;
    }

    if (!consumeOAuthPending()) {
      return;
    }

    const token = parseCallbackToken(callbackUrl);
    if (!token) {
      return;
    }

    if (!storeSessionToken(token)) {
      return;
    }

    import("./auth-client")
      .then(({ authClient }) =>
        authClient.getSession({
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        })
      )
      .then((res) => {
        if (res.data) {
          window.location.assign("/home");
        } else {
          clearStoredSessionToken();
          window.location.assign("/login?error=oauth_verification_failed");
        }
      })
      .catch(() => {
        clearStoredSessionToken();
        window.location.assign("/login?error=oauth_verification_failed");
      });
  }).catch(() => {
    // deep-link handling is best-effort; ignore registration failures
  });
}
