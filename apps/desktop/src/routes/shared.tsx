import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthSession } from "../features/auth/use-session";
import { signOut } from "../lib/auth-client";
import {
  buttonClass,
  desktopShellClass,
  eyebrowClass,
  headerActionsClass,
  heroCardClass,
  heroSubtitleClass,
  heroTitleClass,
} from "../lib/ui";

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const session = useAuthSession();

  return (
    <main className={desktopShellClass}>
      <header className={heroCardClass}>
        <div>
          <p className={eyebrowClass}>Larity Desktop</p>
          <h1 className={heroTitleClass}>{title}</h1>
          {subtitle ? <p className={heroSubtitleClass}>{subtitle}</p> : null}
        </div>
        <div className={headerActionsClass}>
          <Link className={buttonClass({ variant: "ghost" })} to="/dashboard">
            Dashboard
          </Link>
          {session.user ? (
            <button
              className={buttonClass()}
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              type="button"
            >
              Sign Out
            </button>
          ) : null}
        </div>
      </header>

      {children}
    </main>
  );
}
