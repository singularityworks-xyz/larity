import type { ReactNode } from "react";
import {
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className={desktopShellClass}>
      <header className={heroCardClass}>
        <div>
          <p className={eyebrowClass}>Larity Desktop</p>
          <h1 className={heroTitleClass}>{title}</h1>
          {subtitle ? <p className={heroSubtitleClass}>{subtitle}</p> : null}
        </div>
      </header>

      {children}
    </main>
  );
}
