import { useNavigate } from "react-router-dom";
import type { RecentActivityItem } from "../../features/home/types";
import { panelClass } from "../../lib/ui";

interface RecentActivityProps {
  activity: RecentActivityItem[];
  loading: boolean;
}

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "--";
  }
  const mins = Math.round(ms / 60_000);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderContent(
  activity: RecentActivityItem[],
  loading: boolean,
  navigate: ReturnType<typeof useNavigate>
) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            className="flex animate-pulse items-center gap-3 rounded-lg py-1.5"
            key={`ra-sk-${i}`}
          >
            <div className="h-3 w-14 rounded-sm bg-bg-subtle" />
            <div className="h-3 w-32 rounded-sm bg-bg-subtle" />
            <div className="h-3 w-10 rounded-sm bg-bg-subtle" />
          </div>
        ))}
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <p className="py-1 text-[11.5px] text-fg-muted leading-relaxed">
        No completed meetings yet
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {activity.map((item) => (
        <li key={item.id}>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-bg-subtle"
            onClick={() => navigate(`/meeting-post/${item.id}`)}
            type="button"
          >
            <span className="w-14 shrink-0 font-medium text-[10.5px] text-fg-subtle tabular-nums leading-none">
              {formatDate(item.endedAt)}
            </span>
            <span className="min-w-0 truncate font-medium text-[12.5px] text-fg leading-snug">
              {item.title}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-border bg-bg-overlay px-2 py-0.5 font-medium text-[10px] text-fg-muted leading-snug">
                {item.client.name}
              </span>
              <span className="font-medium text-[10px] text-fg-subtle tabular-nums leading-none">
                {formatDuration(item.durationMs)}
              </span>
              <span className="flex items-center gap-1">
                {item.decisionsExtracted > 0 ? (
                  <span className="font-medium text-[10px] text-fg-muted leading-none">
                    {item.decisionsExtracted}d
                  </span>
                ) : null}
                {item.tasksCreated > 0 ? (
                  <span className="font-medium text-[10px] text-fg-muted leading-none">
                    {item.tasksCreated}t
                  </span>
                ) : null}
                {item.commitmentsCaptured > 0 ? (
                  <span className="font-medium text-[10px] text-fg-muted leading-none">
                    {item.commitmentsCaptured}c
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RecentActivity({ activity, loading }: RecentActivityProps) {
  const navigate = useNavigate();

  return (
    <div className={panelClass}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="font-medium text-[11px] text-text-tertiary uppercase leading-none tracking-[0.06em]">
          Recent Activity
        </p>
      </div>
      {renderContent(activity, loading, navigate)}
    </div>
  );
}
