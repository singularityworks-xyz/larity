import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthSession } from "../features/auth/use-session";
import { signOut } from "../lib/auth-client";

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
    <main className="desktop-shell desktop-app-shell">
      <header className="hero-card app-header">
        <div>
          <p className="eyebrow">Larity Desktop</p>
          <h1>{title}</h1>
          {subtitle ? <p className="hero-subtitle">{subtitle}</p> : null}
        </div>
        <div className="header-actions">
          <Link className="ghost-link" to="/dashboard">
            Dashboard
          </Link>
          {session.user ? (
            <button
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
