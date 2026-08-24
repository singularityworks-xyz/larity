import { redirect } from "react-router-dom";
import { authClient } from "../lib/auth-client";
import { getStoredSessionToken } from "../lib/session-token";

function isOnboardingPath(pathname: string): boolean {
  return pathname.startsWith("/onboarding");
}

function isGuestPath(pathname: string): boolean {
  return (
    pathname === "/welcome" || pathname === "/login" || pathname === "/register"
  );
}

/**
 * Loaders are fast-path synchronous when a session token is stored:
 * the shell paints immediately and AuthGuardSkeleton validates the
 * session client-side (cookie) after first paint.
 *
 * When NO token is stored, we fall back to the server cookie check so
 * legacy cookie-only sessions (e.g. email login before token persistence)
 * still resolve correctly. That round-trip only happens for users who are
 * about to be redirected anyway, so it does not add perceived latency to
 * normal logged-in navigation.
 */

export async function authGateLoader({
  request,
}: {
  request: Request;
}): Promise<null> {
  const pathname = new URL(request.url).pathname;
  const token = getStoredSessionToken();

  if (token) {
    // Token present: render shell immediately; AuthGuardSkeleton handles
    // session validation + orgId redirect client-side after first paint.
    return null;
  }

  // No stored token: could be a legacy cookie session — verify server-side.
  const { data } = await authClient.getSession();
  if (!data?.user) {
    if (isGuestPath(pathname)) {
      return null;
    }
    throw redirect("/welcome");
  }

  return null;
}

export async function rootIndexLoader(): Promise<never> {
  const token = getStoredSessionToken();
  if (token) {
    throw redirect("/home");
  }

  // Legacy cookie session fallback.
  const { data } = await authClient.getSession();
  if (!data?.user) {
    throw redirect("/welcome");
  }

  throw redirect("/home");
}

export async function guestOnlyLoader({
  request,
}: {
  request: Request;
}): Promise<null> {
  const pathname = new URL(request.url).pathname;
  const token = getStoredSessionToken();

  if (token && isGuestPath(pathname)) {
    throw redirect("/home");
  }
  if (token) {
    return null;
  }

  // No stored token: verify cookie so signed-in users on guest pages are
  // redirected even without a persisted token.
  const { data } = await authClient.getSession();
  if (data?.user && isGuestPath(pathname)) {
    throw redirect("/home");
  }

  return null;
}

export async function onboardingLoader({
  request,
}: {
  request: Request;
}): Promise<null> {
  const pathname = new URL(request.url).pathname;
  const token = getStoredSessionToken();

  if (token) {
    if (!isOnboardingPath(pathname)) {
      throw redirect("/onboarding");
    }
    return null;
  }

  // Legacy cookie session fallback.
  const { data } = await authClient.getSession();
  if (!data?.user) {
    throw redirect("/welcome");
  }
  if ((data.user as { orgId?: string | null }).orgId) {
    throw redirect("/home");
  }
  if (!isOnboardingPath(pathname)) {
    throw redirect("/onboarding");
  }

  return null;
}
