import { HealthStrip } from "../components/home/health-strip";
import { NextMeetingCard } from "../components/home/next-meeting-card";
import { OpenCommitments } from "../components/home/open-commitments";
import { RecentActivity } from "../components/home/recent-activity";
import { TodayPanel } from "../components/home/today-panel";
import { useAuthSession } from "../features/auth/use-session";
import { useHealth } from "../features/home/use-health";
import { useHome } from "../features/home/use-home";
import {
  cx,
  desktopShellClass,
  eyebrowClass,
  heroCardClass,
  heroSubtitleClass,
  heroTitleClass,
  homeGridClass,
} from "../lib/ui";

export function HomePage() {
  const session = useAuthSession();
  const { data, isLoading, error } = useHome();
  const health = useHealth();

  return (
    <div className={cx(desktopShellClass, "gap-3")}>
      <header className={cx(heroCardClass, "flex-col gap-0.5")}>
        <p className={eyebrowClass}>Larity Desktop</p>
        <h1 className={heroTitleClass}>Home</h1>
        {session.user ? (
          <p className={heroSubtitleClass}>
            {session.user.name ?? session.user.email}
          </p>
        ) : null}
      </header>

      {error ? (
        <section className="rounded-[var(--radius-0)] border border-danger-fg bg-danger-bg p-4">
          <p className="font-medium text-[12px] text-danger-fg leading-snug">
            Could not load home data
          </p>
          <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <button
            className="mt-2.5 inline-flex h-7 items-center rounded-lg border border-danger-fg bg-transparent px-3 font-medium text-[11.5px] text-danger-fg leading-none transition-all duration-150 ease-out hover:bg-danger-bg active:scale-[0.98]"
            onClick={() => window.location.reload()}
            type="button"
          >
            Retry
          </button>
        </section>
      ) : (
        <>
          <NextMeetingCard
            loading={isLoading}
            meeting={data?.nextMeeting ?? null}
          />

          <div className={homeGridClass}>
            <TodayPanel
              loading={isLoading}
              meetings={data?.todayMeetings ?? []}
            />
            <RecentActivity
              activity={data?.recentActivity ?? []}
              loading={isLoading}
            />
          </div>

          <OpenCommitments
            commitments={data?.openCommitments ?? []}
            loading={isLoading}
          />

          <HealthStrip health={health} />
        </>
      )}
    </div>
  );
}
