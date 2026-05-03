import { redirect } from "react-router-dom";
import { authClient } from "../lib/auth-client";

interface SessionUser {
  orgId?: string | null;
}

function isOnboardingPath(pathname: string): boolean {
  return pathname.startsWith("/onboarding");
}

function isGuestPath(pathname: string): boolean {
  return (
    pathname === "/welcome" || pathname === "/login" || pathname === "/register"
  );
}

async function getSessionUser(): Promise<SessionUser | null> {
  const { data } = await authClient.getSession();
  if (!data?.user) {
    return null;
  }
  return data.user as SessionUser;
}

export async function authGateLoader({
  request,
}: {
  request: Request;
}): Promise<null> {
  const pathname = new URL(request.url).pathname;
  const user = await getSessionUser();

  if (!user) {
    if (isGuestPath(pathname)) {
      return null;
    }
    throw redirect("/welcome");
  }

  if (!user.orgId) {
    if (isOnboardingPath(pathname)) {
      return null;
    }
    throw redirect("/onboarding");
  }

  if (isGuestPath(pathname) || pathname === "/onboarding") {
    throw redirect("/home");
  }

  return null;
}

export async function rootIndexLoader(): Promise<never> {
  const user = await getSessionUser();
  if (!user) {
    throw redirect("/welcome");
  }

  if (!user.orgId) {
    throw redirect("/onboarding");
  }

  throw redirect("/home");
}

export async function guestOnlyLoader({
  request,
}: {
  request: Request;
}): Promise<null> {
  const pathname = new URL(request.url).pathname;
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  if (!user.orgId) {
    throw redirect("/onboarding");
  }

  if (isGuestPath(pathname)) {
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
  const user = await getSessionUser();

  if (!user) {
    throw redirect("/welcome");
  }

  if (user.orgId) {
    throw redirect("/home");
  }

  if (!isOnboardingPath(pathname)) {
    throw redirect("/onboarding");
  }

  return null;
}
