import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuthSession } from "../features/auth/use-session";
import { clearStoredSessionToken } from "../lib/session-token";
import {
  cx,
  desktopShellClass,
  eyebrowClass,
  heroCardClass,
  heroSubtitleClass,
  heroTitleClass,
} from "../lib/ui";

export function AppShell({
  title,
  subtitle,
  children,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showBack?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <main className={desktopShellClass}>
      <header className={cx(heroCardClass, "flex items-center gap-4")}>
        {showBack && (
          <button
            aria-label="Go back"
            className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-elevated text-fg-subtle transition-all [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-bg-subtle hover:text-fg active:scale-95"
            onClick={() => navigate(-1)}
            type="button"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}
        <div className="flex-grow">
          <p className={eyebrowClass}>Larity Desktop</p>
          <h1 className={heroTitleClass}>{title}</h1>
          {subtitle ? <p className={heroSubtitleClass}>{subtitle}</p> : null}
        </div>
      </header>

      {children}
    </main>
  );
}

export function RouteSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="h-4 w-32 animate-pulse rounded bg-bg-subtle" />
      <div className="h-16 w-full animate-pulse rounded-xl bg-bg-subtle" />
      <div className="h-4 w-48 animate-pulse rounded bg-bg-subtle" />
      <div className="h-32 w-full animate-pulse rounded-xl bg-bg-subtle" />
      <div className="h-32 w-full animate-pulse rounded-xl bg-bg-subtle" />
    </div>
  );
}

export function AuthGuardSkeleton({
  children,
  requireOrg = true,
}: {
  children: ReactNode;
  requireOrg?: boolean;
}) {
  const session = useAuthSession();

  if (session.isPending) {
    return <RouteSkeleton />;
  }

  if (!session.data?.user) {
    clearStoredSessionToken();
    return <Navigate replace to="/welcome" />;
  }

  const user = session.data.user as { orgId?: string | null };
  if (requireOrg && !user.orgId) {
    return <Navigate replace to="/onboarding" />;
  }

  return <>{children}</>;
}
