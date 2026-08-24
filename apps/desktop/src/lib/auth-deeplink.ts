import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

import {
  clearStoredSessionToken,
  isValidCallbackUrl,
  parseCallbackToken,
  storeSessionToken,
} from "./session-token";

const OAUTH_PENDING_KEY = "larity.oauth-pending";
/** Pending OAuth window — 10 minutes. */
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

/**
 * Call before `signIn.social({ callbackURL: "larity://auth/callback" })`
 * so the deep-link handler only accepts tokens for an initiated flow.
 */
export function prepareOAuthDeepLink(): void {
  markOAuthPending();
}

/**
 * Listens for `larity://` deep links and completes OAuth by persisting
 * the session token delivered by the callback redirect. Registered once
 * at app startup. Validates pending state and token shape, verifies
 * the session before navigating.
 */
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

    // Only accept deep-links that correspond to a recently-initiated OAuth flow.
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

    // Verify the token is a real session before navigating — prevents fixation.
    // Dynamic import avoids a circular dependency with `auth-client`.
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
          import("../main").then(({ router }) => router.navigate("/home"));
        } else {
          clearStoredSessionToken();
          import("../main").then(({ router }) => router.navigate("/login?error=oauth_verification_failed"));
        }
      })
      .catch(() => {
        clearStoredSessionToken();
        import("../main").then(({ router }) => router.navigate("/login?error=oauth_verification_failed"));
      });
  }).catch(() => {
    // deep-link handling is best-effort; ignore registration failures
  });
}
