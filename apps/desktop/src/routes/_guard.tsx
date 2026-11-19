import { redirect } from "react-router-dom";
import { authClient } from "../lib/auth-client";
import {
  clearStoredSessionToken,
  getStoredSessionToken,
} from "../lib/session-token";

function isGuestPath(pathname: string): boolean {
  return (
    pathname === "/welcome" || pathname === "/login" || pathname === "/register"
  );
}

export async function authGateLoader({
  request,
}: {
  request: Request;
}): Promise<null> {
  const pathname = new URL(request.url).pathname;
  const token = getStoredSessionToken();

  if (token) {
    return null;
  }

  const { data } = await authClient.getSession();
  if (!data?.user) {
    clearStoredSessionToken();
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

  const { data } = await authClient.getSession();
  if (!data?.user) {
    clearStoredSessionToken();
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

  const { data } = await authClient.getSession();
  if (data?.user && isGuestPath(pathname)) {
    throw redirect("/home");
  }

  return null;
}

export async function onboardingLoader(): Promise<null> {
  const token = getStoredSessionToken();

  const { data } = await authClient.getSession();
  if (!data?.user) {
    if (token) {
      clearStoredSessionToken();
    }
    throw redirect("/welcome");
  }

  const user = data.user as { orgId?: string | null };
  if (user.orgId) {
    throw redirect("/home");
  }

  return null;
}
